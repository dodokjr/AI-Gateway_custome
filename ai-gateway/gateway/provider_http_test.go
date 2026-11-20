package gateway

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
)

func TestRedirectLintasHostDitolakDanKunciTidakBocor(t *testing.T) {
	var leaked int32
	other := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("X-Api-Key") != "" {
			atomic.AddInt32(&leaked, 1)
		}
		_, _ = w.Write([]byte("<!doctype html><html>login</html>"))
	}))
	defer other.Close()
	origin := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, other.URL+"/signin", http.StatusFound)
	}))
	defer origin.Close()

	var out map[string]any
	err := doJSON(context.Background(), origin.URL+"/v1", map[string]string{"X-Api-Key": "rahasia-123"}, map[string]string{"a": "b"}, &out)
	if err == nil || !strings.Contains(err.Error(), "pengalihan ke host lain ditolak") {
		t.Fatalf("harus menolak pengalihan lintas host, dapat %v", err)
	}
	if atomic.LoadInt32(&leaked) != 0 {
		t.Fatal("kunci API bocor ke host lain")
	}
}

func TestGalatHTMLDiringkas(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusForbidden)
		_, _ = w.Write([]byte("<!doctype html><html><head><title>Sign in</title></head><body>" + strings.Repeat("x", 5000) + "</body></html>"))
	}))
	defer srv.Close()
	var out map[string]any
	err := doJSON(context.Background(), srv.URL, nil, map[string]string{}, &out)
	if err == nil || strings.Contains(err.Error(), "<html") || len(err.Error()) > 250 {
		t.Fatalf("galat HTML harus diringkas: %v", err)
	}
	if !strings.Contains(err.Error(), "halaman HTML") || !strings.HasPrefix(err.Error(), "HTTP 403") {
		t.Fatalf("pesan kurang jelas: %v", err)
	}
}

func TestResponsBukanJSONDiringkas(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte("<html><head></head>maaf</html>"))
	}))
	defer srv.Close()
	var out map[string]any
	err := doJSON(context.Background(), srv.URL, nil, map[string]string{}, &out)
	if err == nil || !strings.Contains(err.Error(), "bukan JSON") {
		t.Fatalf("harus galat bukan JSON: %v", err)
	}
}