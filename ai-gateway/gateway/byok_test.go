package gateway

import (
	"context"
	"errors"
	"strings"
	"testing"
)

func twoMocks(t *testing.T) (*Gateway, *mock, *mock) {
	t.Helper()
	a := newMock(t, func(auth string) (int, string) {
		if strings.Contains(auth, "kunci-user") {
			return 200, "dari-a-token-user"
		}
		return 200, "dari-a"
	})
	b := newMock(t, func(string) (int, string) { return 200, "dari-b" })
	gw, err := NewGateway(Config{Providers: []ProviderCfg{
		{Name: "a", Type: "openai_compat", BaseURL: a.srv.URL, Model: "m", Keys: []string{"ka"}, Priority: 1},
		{Name: "b", Type: "openai_compat", BaseURL: b.srv.URL, Model: "m", Keys: []string{"kb"}, Priority: 2},
	}})
	if err != nil {
		t.Fatal(err)
	}
	return gw, a, b
}

func TestStrictTidakFailover(t *testing.T) {
	a := newMock(t, func(string) (int, string) { return 429, "" })
	b := newMock(t, func(string) (int, string) { return 200, "dari-b" })
	gw, _ := NewGateway(Config{Providers: []ProviderCfg{
		{Name: "a", Type: "openai_compat", BaseURL: a.srv.URL, Model: "m", Keys: []string{"ka"}, Priority: 1},
		{Name: "b", Type: "openai_compat", BaseURL: b.srv.URL, Model: "m", Keys: []string{"kb"}, Priority: 2},
	}})
	_, err := gw.Chat(context.Background(), ChatOptions{Provider: "a", Strict: true}, "", userMsg("halo"))
	var af *AllFailedError
	if !errors.As(err, &af) {
		t.Fatalf("strict harus gagal tanpa pindah ke b, dapat %v", err)
	}
	if b.hits != 0 {
		t.Fatalf("provider b tidak boleh dipanggil, hits=%d", b.hits)
	}
	// tanpa strict, failover tetap jalan
	res, err := gw.Chat(context.Background(), ChatOptions{Provider: "a"}, "", userMsg("halo2"))
	if err != nil || res.Provider != "b" {
		t.Fatalf("non-strict harus failover: %v %v", res, err)
	}
}

func TestStrictProviderTidakDikenal(t *testing.T) {
	gw, _, _ := twoMocks(t)
	_, err := gw.Chat(context.Background(), ChatOptions{Provider: "zzz", Strict: true}, "", userMsg("x"))
	var unk *UnknownProviderError
	if !errors.As(err, &unk) {
		t.Fatalf("harus UnknownProviderError, dapat %v", err)
	}
}

func TestBYOKPakaiTokenPenggunaSajaTanpaFailover(t *testing.T) {
	gw, a, b := twoMocks(t)
	res, err := gw.Chat(context.Background(), ChatOptions{Provider: "a", UserKey: "kunci-user"}, "", userMsg("rahasia"))
	if err != nil || res.Text != "dari-a-token-user" || res.Provider != "a" {
		t.Fatalf("BYOK gagal: %v %v", res, err)
	}
	if b.hits != 0 {
		t.Fatal("BYOK tidak boleh failover ke provider lain")
	}
	if a.hits != 1 {
		t.Fatalf("a dipanggil %d kali", a.hits)
	}
	if st := gw.Status(); st[0].Keys[0].OK != 0 {
		t.Fatal("token pengguna tidak boleh mengubah statistik key server")
	}
}

func TestBYOKGalatDisamarkan(t *testing.T) {
	bad := newMock(t, func(string) (int, string) { return 401, "" })
	gw, _ := NewGateway(Config{Providers: []ProviderCfg{
		{Name: "a", Type: "openai_compat", BaseURL: bad.srv.URL, Model: "m", Keys: []string{"ka"}},
	}})
	secret := "sk-RAHASIA1234567890abcdefghij"
	_, err := gw.Chat(context.Background(), ChatOptions{Provider: "a", UserKey: secret}, "", userMsg("x"))
	var uke *UserKeyError
	if !errors.As(err, &uke) {
		t.Fatalf("harus UserKeyError, dapat %v", err)
	}
	if strings.Contains(err.Error(), secret) {
		t.Fatal("token bocor di pesan galat")
	}
}

func TestBYOKTidakDicatatDanTidakDipelajari(t *testing.T) {
	gw, _, _ := twoMocks(t)
	lg := &memLog{}
	gw.SetTrainingLog(lg)
	if _, err := gw.Chat(context.Background(), ChatOptions{Provider: "a", UserKey: "kunci-user"}, "", userMsg("pertanyaan pribadi premium")); err != nil {
		t.Fatal(err)
	}
	if n, _ := lg.Count(); n != 0 {
		t.Fatalf("percakapan BYOK tidak boleh masuk log pelatihan, count=%d", n)
	}
}

func TestBYOKButuhProviderDanBukanCustom(t *testing.T) {
	gw, _, _ := twoMocks(t)
	if _, err := gw.Chat(context.Background(), ChatOptions{UserKey: "k"}, "", userMsg("x")); err == nil {
		t.Fatal("tanpa provider harus galat")
	}
}