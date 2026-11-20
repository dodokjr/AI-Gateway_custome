package gateway

import (
	"context"
	"errors"
	"strings"

	"ai-gateway/gateway/custom"
)

// UnknownProviderError: provider yang diminta tidak ada di konfigurasi.
type UnknownProviderError struct{ Name string }

func (e *UnknownProviderError) Error() string {
	return "provider tidak dikenal: " + truncate(e.Name, 40)
}

// UserKeyError: panggilan dengan token pengguna gagal. Pesan sudah disamarkan.
type UserKeyError struct {
	Provider string
	Msg      string
}

func (e *UserKeyError) Error() string {
	return "token pengguna untuk " + e.Provider + " gagal: " + e.Msg
}

// HasProvider melaporkan apakah provider bernama name ada (tanpa membedakan huruf besar/kecil).
func (g *Gateway) HasProvider(name string) bool {
	for _, p := range g.provs {
		if strings.EqualFold(p.cfg.Name, name) {
			return true
		}
	}
	return false
}

// ProviderType mengembalikan tipe provider ("" bila tidak ada).
func (g *Gateway) ProviderType(name string) string {
	for _, p := range g.provs {
		if strings.EqualFold(p.cfg.Name, name) {
			return p.cfg.Type
		}
	}
	return ""
}

// chatUserKey memakai token milik pengguna untuk SATU provider terpilih.
// Aturan keamanan:
//   - hanya provider yang sudah ada di konfigurasi (URL dasar tetap milik server,
//     jadi tidak ada celah SSRF lewat token);
//   - tanpa failover, tanpa cooldown/statistik key milik server;
//   - tidak dicatat ke log pelatihan dan tidak dipelajari Custom AI (privasi);
//   - token disamarkan dari pesan galat sebelum dikembalikan.
func (g *Gateway) chatUserKey(ctx context.Context, o ChatOptions, system string, msgs []Message) (*ChatResult, error) {
	if o.Provider == "" {
		return nil, errors.New("token pengguna harus disertai provider")
	}
	var prov *provState
	for _, p := range g.provs {
		if strings.EqualFold(p.cfg.Name, o.Provider) {
			prov = p
			break
		}
	}
	if prov == nil {
		return nil, &UnknownProviderError{Name: o.Provider}
	}
	if prov.cfg.Type == "custom" {
		return nil, errors.New("provider ini tidak memakai token pengguna")
	}
	model := prov.cfg.Model
	if o.Model != "" {
		model = o.Model
	}
	cctx, cancel := context.WithTimeout(ctx, g.timeout)
	defer cancel()
	text, err := prov.impl.Chat(cctx, o.UserKey, ProviderRequest{
		Model: model, System: system, Messages: msgs,
		Temperature: o.Temperature, MaxTokens: o.MaxTokens,
	})
	if err != nil {
		if ctx.Err() != nil {
			return nil, ctx.Err()
		}
		msg := strings.ReplaceAll(err.Error(), o.UserKey, "***")
		return nil, &UserKeyError{Provider: prov.cfg.Name, Msg: truncate(custom.RedactSecrets(msg), 300)}
	}
	if strings.TrimSpace(text) == "" {
		return nil, &UserKeyError{Provider: prov.cfg.Name, Msg: "respons kosong"}
	}
	return &ChatResult{Text: text, Provider: prov.cfg.Name, Model: model}, nil
}