package engine

import (
	"math"
	"math/big"
)

// ── App-facing engine API (mirrors engineApi.ts) ──

// BabelCardinality returns N^L for a form.
func BabelCardinality(form FormDef, N int) *big.Int {
	return BabelSize(form.L, big.NewInt(int64(N)))
}

// PulledPoem is the result of a void pull or index lookup.
type PulledPoem struct {
	Form        PullForm `json:"form"`
	Lines       []string `json:"lines"`
	BabelIndex  string   `json:"babelIndex"`
	BabelDigits int      `json:"babelDigits"`
	LushiIndex  *string  `json:"lushiIndex,omitempty"`
	Valid       bool     `json:"valid"`
	Pos         Vec3     `json:"pos"`
}

// PointForBabelIndex returns the canonical scattered position of a known Babel index.
func PointForBabelIndex(form FormDef, b *big.Int, N int, R float64) Vec3 {
	card := BabelCardinality(form, N)
	sc := Scatter(card, cFeistelKey, b)
	return IndexToPoint(sc, R)
}

// IndexFromPoint deterministically samples a big index from a world point, reduced mod M.
func IndexFromPoint(pos Vec3, M *big.Int) *big.Int {
	q := func(v float64) int64 {
		return int64(math.Round(v * 16))
	}
	sx := big.NewInt(q(pos.X) * cSeedMul1)
	sy := big.NewInt(q(pos.Y) * cSeedMul2)
	sz := big.NewInt(q(pos.Z) * cSeedMul3)
	seed := new(big.Int).Xor(sx, sy)
	seed.Xor(seed, sz)
	seed.And(seed, cU64)

	bitLen := M.BitLen() + 16
	out := new(big.Int)
	ctr := int64(0)
	for need := bitLen; need > 0; need -= 64 {
		v := new(big.Int).Xor(
			new(big.Int).SetInt64(seed.Int64()),
			new(big.Int).Mul(big.NewInt(ctr), big.NewInt(cCtrMul)),
		)
		out.Lsh(out, 64)
		out.Or(out, splitmix64(v))
		ctr++
	}
	return new(big.Int).Mod(out, M)
}

func toLines(charset []string, form FormDef, chars []int) []string {
	out := make([]string, form.Lines)
	for l := 0; l < form.Lines; l++ {
		var line string
		for i := 0; i < form.Cpl; i++ {
			line += charset[chars[l*form.Cpl+i]]
		}
		out[l] = line
	}
	return out
}

func lineBreakSyms(N int, lineCharIds [][]int) []int {
	var syms []int
	for l, ids := range lineCharIds {
		if l > 0 {
			syms = append(syms, N)
		}
		syms = append(syms, ids...)
	}
	return syms
}

func fixedFormSyms(form FormDef, N int, chars []int) []int {
	lines := make([][]int, form.Lines)
	for l := 0; l < form.Lines; l++ {
		lines[l] = chars[l*form.Cpl : (l+1)*form.Cpl]
	}
	return lineBreakSyms(N, lines)
}

func describe(lx Lexicon, charset []string, form FormDef, chars []int, pos Vec3) PulledPoem {
	matched := MatchVariant(lx, form, chars)
	N := lx.N
	syms := fixedFormSyms(form, N, chars)
	b := AnyRank(N, syms)
	result := PulledPoem{
		Form:        form.ID,
		Lines:       toLines(charset, form, chars),
		BabelIndex:  b.String(),
		BabelDigits: len(b.String()),
		Valid:       matched != nil,
		Pos:         pos,
	}
	if matched != nil {
		lushiIdx := RegulatedRank(lx, form, *matched).String()
		result.LushiIndex = &lushiIdx
	}
	return result
}

func describeAny(lx Lexicon, charset []string, syms []int, pos Vec3) PulledPoem {
	N := lx.N
	lines := make([]string, 0)
	var cur string
	for _, s := range syms {
		if s == N {
			lines = append(lines, cur)
			cur = ""
		} else {
			cur += charset[s]
		}
	}
	lines = append(lines, cur)
	if len(lines) == 0 {
		lines = []string{""}
	}
	b := AnyRank(N, syms)
	return PulledPoem{
		Form:        "ziyou",
		Lines:       lines,
		BabelIndex:  b.String(),
		BabelDigits: len(b.String()),
		Valid:       false,
		Pos:         pos,
	}
}

// PullAt generates a poem at the given world point for the given form.
func PullAt(lx Lexicon, charset []string, formId PullForm, pos Vec3, lushiOnly bool, commonK int) PulledPoem {
	R := pos
	if formId == "ziyou" {
		N := lx.N
		M := N
		if commonK > 0 && commonK < N {
			M = commonK
		}
		W := int(math.Max(1, math.Round(float64(M)/5)))
		radix := big.NewInt(int64(M + W))
		k := IndexFromPoint(pos, new(big.Int).Exp(radix, big.NewInt(30), nil))
		ids := BabelUnrank(30, radix, k)
		syms := make([]int, len(ids))
		for i, id := range ids {
			if id >= M {
				syms[i] = N
			} else {
				syms[i] = id
			}
		}
		return describeAny(lx, charset, syms, R)
	}
	form := FORMS[formId]
	if lushiOnly {
		size := RegulatedSize(lx, form)
		if size.Sign() > 0 {
			s := IndexFromPoint(pos, size)
			poem := RegulatedUnrank(lx, form, s)
			return describe(lx, charset, form, poem.Chars, R)
		}
	}
	N := lx.N
	radix := big.NewInt(int64(N))
	if commonK > 0 && commonK < N {
		radix = big.NewInt(int64(commonK))
	}
	b := IndexFromPoint(pos, new(big.Int).Exp(radix, big.NewInt(int64(form.L)), nil))
	return describe(lx, charset, form, BabelUnrank(form.L, radix, b), R)
}

// PullByIndex decodes a decimal index string back into a poem.
func PullByIndex(lx Lexicon, charset []string, indexInput string) *PulledPoem {
	digits := stripNonDigits(indexInput)
	if digits == "" {
		return nil
	}
	b, ok := new(big.Int).SetString(digits, 10)
	if !ok {
		return nil
	}
	N := lx.N
	syms := AnyUnrank(N, b)
	R := Vec3{}
	result := describeAny(lx, charset, syms, R)
	return &result
}

// InferForm guesses the 诗体 from line structure.
func InferForm(lines []string) PullForm {
	if len(lines) == 0 {
		return "ziyou"
	}
	lens := make([]int, len(lines))
	for i, l := range lines {
		lens[i] = len([]rune(l))
	}
	uniform := true
	for _, x := range lens {
		if x != lens[0] {
			uniform = false
			break
		}
	}
	if uniform {
		if len(lines) == 4 && lens[0] == 5 {
			return "wujue"
		}
		if len(lines) == 4 && lens[0] == 7 {
			return "qijue"
		}
		if len(lines) == 8 && lens[0] == 5 {
			return "wulu"
		}
		if len(lines) == 8 && lens[0] == 7 {
			return "qilu"
		}
	}
	return "ziyou"
}

func stripNonDigits(s string) string {
	out := make([]byte, 0, len(s))
	for i := 0; i < len(s); i++ {
		if s[i] >= '0' && s[i] <= '9' {
			out = append(out, s[i])
		}
	}
	return string(out)
}
