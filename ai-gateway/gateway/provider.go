package gateway

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"
)

// ProviderRequest adalah permintaan yang sudah dinormalisasi (teks saja).
type ProviderRequest struct {
	Model       string
	System      string
	Messages    []Message // hanya role user/assistant, selang-seling, diawali user
	Temperature *float64
	MaxTokens   int
}

// APIError adalah error HTTP dari provider.
type APIError struct {
	Status     int
	Body       string
	RetryAfter time.Duration
}

func (e *APIError) Error() string { return fmt.Sprintf("HTTP %d: %s", e.Status, e.Body) }

type Provider interface {
	Chat(ctx context.Context, key string, r ProviderRequest) (string, error)
}

// Reply adalah jawaban kaya dari provider yang bisa menyertakan referensi dan metadata.
type Reply struct {
	Text      string
	Secondary string
	Meta      map[string]any
}

// RichProvider (opsional) mengembalikan Reply lengkap; Gateway memakainya bila tersedia.
type RichProvider interface {
	ChatRich(ctx context.Context, key string, r ProviderRequest) (Reply, error)
}

// httpClient menolak pengalihan ke host lain: header kunci kustom (x-api-key, x-goog-api-key)
// tidak dibuang otomatis oleh Go pada pengalihan lintas host, jadi kunci bisa terbawa.
var httpClient = &http.Client{
	CheckRedirect: func(req *http.Request, via []*http.Request) error {
		if len(via) >= 5 {
			return errors.New("terlalu banyak pengalihan")
		}
		if len(via) > 0 && req.URL.Host != via[0].URL.Host {
			return fmt.Errorf("pengalihan ke host lain ditolak (%s): periksa base_url, mungkin diarahkan ke halaman login", req.URL.Host)
		}
		return nil
	},
}

// bodyText meringkas isi respons untuk pesan galat. Halaman HTML (login, proxy, 404) tidak
// ditampilkan mentah karena tidak berguna dan panjang.
func bodyText(data []byte, host string) string {
	s := strings.TrimSpace(string(data))
	l := strings.ToLower(s)
	if len(l) > 200 {
		l = l[:200]
	}
	if strings.HasPrefix(l, "<!doctype html") || strings.HasPrefix(l, "<html") || strings.Contains(l, "<head") {
		return "respons berupa halaman HTML, bukan JSON API (dari " + host + "): base_url salah, atau diarahkan ke halaman login/proxy"
	}
	return truncate(s, 300)
}

func truncate(s string, n int) string {
	s = strings.TrimSpace(s)
	if len(s) > n {
		return s[:n] + "..."
	}
	return s
}

func doJSON(ctx context.Context, url string, headers map[string]string, body, out any) error {
	b, err := json.Marshal(body)
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(b))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	for k, v := range headers {
		req.Header.Set(k, v) // kunci API hanya lewat header, tidak pernah di URL
	}
	resp, err := httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	data, err := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	if err != nil {
		return err
	}
	if resp.StatusCode < 200 || resp.StatusCode > 299 {
		ae := &APIError{Status: resp.StatusCode, Body: bodyText(data, resp.Request.URL.Host)}
		if s := resp.Header.Get("Retry-After"); s != "" {
			if n, e := strconv.Atoi(s); e == nil && n > 0 {
				ae.RetryAfter = time.Duration(n) * time.Second
			}
		}
		return ae
	}
	if err := json.Unmarshal(data, out); err != nil {
		return fmt.Errorf("respons bukan JSON yang valid: %s", bodyText(data, resp.Request.URL.Host))
	}
	return nil
}

// normalize membuang pesan kosong, menggabungkan role berurutan yang sama, dan
// memastikan percakapan diawali pesan user (syarat Anthropic & Gemini).
func normalize(in []Message) []Message {
	var out []Message
	for _, m := range in {
		if strings.TrimSpace(m.Content) == "" {
			continue
		}
		if n := len(out); n > 0 && out[n-1].Role == m.Role {
			out[n-1].Content += "\n\n" + m.Content
			continue
		}
		out = append(out, m)
	}
	if len(out) > 0 && out[0].Role != "user" {
		out = append([]Message{{Role: "user", Content: "(lanjutkan percakapan)"}}, out...)
	}
	return out
}

// ---------- OpenAI & semua yang kompatibel (Groq, OpenRouter, Mistral, Ollama, dll) ----------

type OpenAICompat struct {
	BaseURL        string
	MaxTokensField string
}

func (p OpenAICompat) Chat(ctx context.Context, key string, r ProviderRequest) (string, error) {
	msgs := make([]Message, 0, len(r.Messages)+1)
	if r.System != "" {
		msgs = append(msgs, Message{Role: "system", Content: r.System})
	}
	msgs = append(msgs, r.Messages...)
	body := map[string]any{"model": r.Model, "messages": msgs}
	if r.Temperature != nil {
		body["temperature"] = *r.Temperature
	}
	if r.MaxTokens > 0 {
		f := p.MaxTokensField
		if f == "" {
			f = "max_tokens"
		}
		body[f] = r.MaxTokens
	}
	headers := map[string]string{}
	if key != "" {
		headers["Authorization"] = "Bearer " + key
	}
	var out struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := doJSON(ctx, strings.TrimRight(p.BaseURL, "/")+"/chat/completions", headers, body, &out); err != nil {
		return "", err
	}
	if len(out.Choices) == 0 {
		return "", fmt.Errorf("respons tanpa choices")
	}
	return out.Choices[0].Message.Content, nil
}

// ---------- Anthropic Claude ----------

type Anthropic struct{ BaseURL string }

func (p Anthropic) Chat(ctx context.Context, key string, r ProviderRequest) (string, error) {
	maxTok := r.MaxTokens
	if maxTok <= 0 {
		maxTok = 1024
	}
	body := map[string]any{"model": r.Model, "max_tokens": maxTok, "messages": r.Messages}
	if r.System != "" {
		body["system"] = r.System
	}
	if r.Temperature != nil {
		body["temperature"] = *r.Temperature
	}
	headers := map[string]string{"x-api-key": key, "anthropic-version": "2023-06-01"}
	var out struct {
		Content []struct {
			Type string `json:"type"`
			Text string `json:"text"`
		} `json:"content"`
	}
	if err := doJSON(ctx, strings.TrimRight(p.BaseURL, "/")+"/messages", headers, body, &out); err != nil {
		return "", err
	}
	var sb strings.Builder
	for _, c := range out.Content {
		if c.Type == "text" {
			sb.WriteString(c.Text)
		}
	}
	return sb.String(), nil
}

// ---------- Google Gemini ----------

type Gemini struct{ BaseURL string }

type geminiPart struct {
	Text string `json:"text"`
}
type geminiContent struct {
	Role  string       `json:"role,omitempty"`
	Parts []geminiPart `json:"parts"`
}

func (p Gemini) Chat(ctx context.Context, key string, r ProviderRequest) (string, error) {
	contents := make([]geminiContent, 0, len(r.Messages))
	for _, m := range r.Messages {
		role := "user"
		if m.Role == "assistant" {
			role = "model"
		}
		contents = append(contents, geminiContent{Role: role, Parts: []geminiPart{{Text: m.Content}}})
	}
	body := map[string]any{"contents": contents}
	if r.System != "" {
		body["systemInstruction"] = geminiContent{Parts: []geminiPart{{Text: r.System}}}
	}
	gen := map[string]any{}
	if r.Temperature != nil {
		gen["temperature"] = *r.Temperature
	}
	if r.MaxTokens > 0 {
		gen["maxOutputTokens"] = r.MaxTokens
	}
	if len(gen) > 0 {
		body["generationConfig"] = gen
	}
	url := strings.TrimRight(p.BaseURL, "/") + "/models/" + r.Model + ":generateContent"
	var out struct {
		Candidates []struct {
			Content struct {
				Parts []geminiPart `json:"parts"`
			} `json:"content"`
		} `json:"candidates"`
	}
	if err := doJSON(ctx, url, map[string]string{"x-goog-api-key": key}, body, &out); err != nil {
		return "", err
	}
	if len(out.Candidates) == 0 {
		return "", fmt.Errorf("respons tanpa kandidat (kemungkinan diblokir filter)")
	}
	var sb strings.Builder
	for _, part := range out.Candidates[0].Content.Parts {
		sb.WriteString(part.Text)
	}
	return sb.String(), nil
}

func newProvider(c ProviderCfg) (Provider, error) {
	switch strings.ToLower(c.Type) {
	case "custom":
		return newCustomProvider(c)
	case "openai":
		base := c.BaseURL
		if base == "" {
			base = "https://api.openai.com/v1"
		}
		return OpenAICompat{BaseURL: base, MaxTokensField: "max_completion_tokens"}, nil
	case "openai_compat":
		if c.BaseURL == "" {
			return nil, fmt.Errorf("provider %q: base_url wajib untuk openai_compat", c.Name)
		}
		return OpenAICompat{BaseURL: c.BaseURL}, nil
	case "anthropic":
		base := c.BaseURL
		if base == "" {
			base = "https://api.anthropic.com/v1"
		}
		return Anthropic{BaseURL: base}, nil
	case "gemini":
		base := c.BaseURL
		if base == "" {
			base = "https://generativelanguage.googleapis.com/v1beta"
		}
		return Gemini{BaseURL: base}, nil
	}
	return nil, fmt.Errorf("provider %q: type %q tidak dikenal (openai | openai_compat | anthropic | gemini | custom)", c.Name, c.Type)
}