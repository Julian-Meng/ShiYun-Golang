package engine

import (
	"math/big"
	"testing"
)

// makeFixtureLexicon mirrors the TS lexicon.fixture.ts exactly.
func makeFixtureLexicon(pingCount, zeCount, rhymeGroups int) Lexicon {
	if pingCount%rhymeGroups != 0 {
		panic("pingCount must divide evenly into rhymeGroups")
	}
	per := pingCount / rhymeGroups
	N := pingCount + zeCount

	pingList := make([]uint32, pingCount)
	for i := 0; i < pingCount; i++ {
		pingList[i] = uint32(i)
	}
	zeList := make([]uint32, zeCount)
	for i := 0; i < zeCount; i++ {
		zeList[i] = uint32(pingCount + i)
	}

	toneClass := make([]int8, N)
	rhymeOf := make([]int16, N)
	pingRank := make([]int32, N)
	zeRank := make([]int32, N)
	for i := range rhymeOf {
		rhymeOf[i] = -1
	}
	for i := range pingRank {
		pingRank[i] = -1
	}
	for i := range zeRank {
		zeRank[i] = -1
	}

	for i := 0; i < pingCount; i++ {
		toneClass[i] = 0
		pingRank[i] = int32(i)
		rhymeOf[i] = int16(i / per)
	}
	for i := 0; i < zeCount; i++ {
		id := pingCount + i
		toneClass[id] = 1
		zeRank[id] = int32(i)
	}

	rhymeMembers := make([][]uint32, rhymeGroups)
	rhymeRank := make([][]int32, rhymeGroups)
	for q := 0; q < rhymeGroups; q++ {
		members := make([]uint32, per)
		rank := make([]int32, N)
		for j := range rank {
			rank[j] = -1
		}
		for j := 0; j < per; j++ {
			id := q*per + j
			members[j] = uint32(id)
			rank[id] = int32(j)
		}
		rhymeMembers[q] = members
		rhymeRank[q] = rank
	}

	return Lexicon{
		N:            N,
		PingList:     pingList,
		ZeList:       zeList,
		PingRank:     pingRank,
		ZeRank:       zeRank,
		ToneClass:    toneClass,
		RhymeOf:      rhymeOf,
		RhymeMembers: rhymeMembers,
		RhymeRank:    rhymeRank,
	}
}

var fixtureLex = makeFixtureLexicon(60, 60, 6)

var N = big.NewInt(int64(fixtureLex.N))
var scatterKey = big.NewInt(0xc0ffee)

func TestBabelRoundTrip(t *testing.T) {
	for _, form := range []FormDef{FORMS[Wujue], FORMS[Qijue], FORMS[Wulu], FORMS[Qilu]} {
		babelN := BabelSize(form.L, N)
		t.Run(form.ID, func(t *testing.T) {
			// Edge cases
			for _, k := range []*big.Int{big.NewInt(0), new(big.Int).Sub(babelN, big.NewInt(1))} {
				chars := BabelUnrank(form.L, N, k)
				got := BabelRank(N, chars)
				if got.Cmp(k) != 0 {
					t.Errorf("%s edge: BabelRank(BabelUnrank(%s)) = %s, want %s", form.ID, k, got, k)
				}
				// Check range
				for _, c := range chars {
					if c < 0 || c >= int(N.Int64()) {
						t.Errorf("%s edge: char %d out of range [0,%d)", form.ID, c, N.Int64())
					}
				}
			}
		})
	}
}

func TestGeluRoundTrip(t *testing.T) {
	for _, form := range []FormDef{FORMS[Wujue], FORMS[Qijue], FORMS[Wulu], FORMS[Qilu]} {
		gN := RegulatedSize(fixtureLex, form)
		if gN.Sign() == 0 {
			t.Skipf("%s has zero regulated poems", form.ID)
		}
		t.Run(form.ID, func(t *testing.T) {
			// Edge cases
			for _, s := range []*big.Int{big.NewInt(0), new(big.Int).Sub(gN, big.NewInt(1))} {
				poem := RegulatedUnrank(fixtureLex, form, s)
				got := RegulatedRank(fixtureLex, form, poem)
				if got.Cmp(s) != 0 {
					t.Errorf("%s edge: RegulatedRank(Unrank(%s)) = %s, want %s", form.ID, s, got, s)
				}
				if !IsRegulated(fixtureLex, form, poem.Chars) {
					t.Errorf("%s edge: IsRegulated returned false for valid poem at s=%s", form.ID, s)
				}
			}
		})
	}
}

func TestScatterRoundTrip(t *testing.T) {
	for _, form := range []FormDef{FORMS[Wujue], FORMS[Qijue], FORMS[Wulu], FORMS[Qilu]} {
		babelN := BabelSize(form.L, N)
		gN := RegulatedSize(fixtureLex, form)
		Ms := []struct {
			name string
			M    *big.Int
		}{
			{"babel", babelN},
		}
		if gN.Sign() > 0 {
			Ms = append(Ms, struct {
				name string
				M    *big.Int
			}{"gelu", gN})
		}
		for _, m := range Ms {
			t.Run(form.ID+"/"+m.name, func(t *testing.T) {
				// Edge
				for _, x := range []*big.Int{big.NewInt(0), new(big.Int).Sub(m.M, big.NewInt(1))} {
					y := Scatter(m.M, scatterKey, x)
					if y.Cmp(m.M) >= 0 {
						t.Errorf("scatter(%s) = %s, out of range [0,%s)", x, y, m.M)
					}
					got := Unscatter(m.M, scatterKey, y)
					if got.Cmp(x) != 0 {
						t.Errorf("unscatter(scatter(%s)) = %s, want %s", x, got, x)
					}
				}
			})
		}
	}
}

func TestAnyRankUnrank(t *testing.T) {
	N := 10
	// Edge cases
	tests := []struct {
		name string
		syms []int
	}{
		{"empty", []int{}},
		{"single_char", []int{0}},
		{"single_break", []int{N}},
		{"char_then_break", []int{3, N, 7}},
		{"two_chars", []int{1, 2}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			b := AnyRank(N, tt.syms)
			got := AnyUnrank(N, b)
			if len(got) != len(tt.syms) {
				t.Errorf("len(got)=%d, want %d", len(got), len(tt.syms))
				return
			}
			for i := range got {
				if got[i] != tt.syms[i] {
					t.Errorf("pos %d: got %d, want %d", i, got[i], tt.syms[i])
				}
			}
		})
	}

	// Round-trip: anyUnrank(anyRank(syms)) == syms
	t.Run("round_trip", func(t *testing.T) {
		for _, syms := range [][]int{
			{0, 1, 2, N, 5, 6},
			{N, N, 0},
			{0, N, 1, N, 2},
			{5, 5, 5},
		} {
			b := AnyRank(N, syms)
			got := AnyUnrank(N, b)
			if len(got) != len(syms) {
				t.Fatalf("round_trip: len mismatch")
			}
			for i := range got {
				if got[i] != syms[i] {
					t.Fatalf("round_trip: got[%d]=%d, want %d", i, got[i], syms[i])
				}
			}
		}
	})
}

func TestIndexToPoint(t *testing.T) {
	// IndexToPoint should return points within [-R, R] cube.
	for _, idx := range []*big.Int{
		big.NewInt(0),
		big.NewInt(1),
		big.NewInt(123456789),
		big.NewInt(1 << 60),
	} {
		pt := IndexToPoint(idx, 1000)
		if pt.X < -1000 || pt.X > 1000 || pt.Y < -1000 || pt.Y > 1000 || pt.Z < -1000 || pt.Z > 1000 {
			t.Errorf("IndexToPoint(%s, 1000) = %+v, out of cube", idx, pt)
		}
	}
}

func TestInferForm(t *testing.T) {
	tests := []struct {
		lines []string
		want  PullForm
	}{
		{[]string{"床前明月光", "疑是地上霜", "举头望明月", "低头思故乡"}, "wujue"},
		{[]string{"朝辞白帝彩云间", "千里江陵一日还", "两岸猿声啼不住", "轻舟已过万重山"}, "qijue"},
		{[]string{"国破山河在", "城春草木深", "感时花溅泪", "恨别鸟惊心", "烽火连三月", "家书抵万金", "白头搔更短", "浑欲不胜簪"}, "wulu"},
		{[]string{"a", "bb", "ccc"}, "ziyou"},
	}
	for _, tt := range tests {
		got := InferForm(tt.lines)
		if got != tt.want {
			t.Errorf("InferForm(%v) = %s, want %s", tt.lines, got, tt.want)
		}
	}
}

func TestPullByIndex(t *testing.T) {
	// Simple charset for testing
	charset := make([]string, 10)
	for i := range charset {
		charset[i] = string(rune('A' + i))
	}
	lx := Lexicon{N: 10}

	// Single char 'A' (id=0): AnyRank(10, [0]) = 0*11 + (0+1) = 1
	t.Run("single_A", func(t *testing.T) {
		p := PullByIndex(lx, charset, "1")
		if p == nil {
			t.Fatal("expected non-nil")
		}
		if len(p.Lines) == 0 || p.Lines[0] != "A" {
			t.Errorf("expected 'A', got %v", p.Lines)
		}
		if p.Form != "ziyou" {
			t.Errorf("expected 'ziyou', got %s", p.Form)
		}
		// BabelIndex for anyRank(N, [0]) where N=10: (0+1) = 1
		if p.BabelIndex != "1" {
			t.Errorf("expected '1', got %s", p.BabelIndex)
		}
	})

	// 'AB' with break: syms=[0,10,1] (A, break, B)
	// rank = ((1*11 + 11)*11 + 2) = 22*11 + 2 = 244
	t.Run("AB_with_break", func(t *testing.T) {
		p := PullByIndex(lx, charset, "244")
		if p == nil {
			t.Fatal("expected non-nil")
		}
		if len(p.Lines) != 2 {
			t.Fatalf("expected 2 lines, got %d: %v", len(p.Lines), p.Lines)
		}
		if p.Lines[0] != "A" {
			t.Errorf("line 0: expected 'A', got %s", p.Lines[0])
		}
		if p.Lines[1] != "B" {
			t.Errorf("line 1: expected 'B', got %s", p.Lines[1])
		}
	})
}

func TestSplitAny(t *testing.T) {
	N := 10
	syms := []int{0, 1, N, 3, N, N, 5, 6}
	lines := SplitAny(N, syms)
	if len(lines) != 3 {
		t.Fatalf("expected 3 line groups, got %d: %v", len(lines), lines)
	}
	// group 0: [0,1]
	if len(lines[0]) != 2 || lines[0][0] != 0 || lines[0][1] != 1 {
		t.Errorf("group 0: expected [0,1], got %v", lines[0])
	}
	// group 1: [3] (consecutive breaks → empty segments dropped)
	if len(lines[1]) != 1 || lines[1][0] != 3 {
		t.Errorf("group 1: expected [3], got %v", lines[1])
	}
	// group 2: [5,6]
	if len(lines[2]) != 2 || lines[2][0] != 5 || lines[2][1] != 6 {
		t.Errorf("group 2: expected [5,6], got %v", lines[2])
	}
}
