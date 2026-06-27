package engine

import "math/big"

// ── Tone templates (4 基本律句 + 对/粘) ──
// Tone: 0 = 平 (level), 1 = 仄 (oblique)

// wuLine: 五言 4 基本律句 keyed by (head, tail).
func wuLine(head, tail int) []int {
	if head == 1 && tail == 1 {
		return []int{1, 1, 0, 0, 1} // 仄起仄收
	}
	if head == 1 && tail == 0 {
		return []int{1, 1, 1, 0, 0} // 仄起平收
	}
	if head == 0 && tail == 1 {
		return []int{0, 0, 0, 1, 1} // 平起仄收
	}
	return []int{0, 0, 1, 1, 0} // 平起平收
}

// makeLine: 七言 = 五言 prefixed by two chars of opposite tone to head.
func makeLine(cpl int, head, tail int) []int {
	five := wuLine(head, tail)
	if cpl == 5 {
		return five
	}
	p := head ^ 1
	return append([]int{p, p}, five...)
}

func oppose(line []int) []int {
	out := make([]int, len(line))
	for i, t := range line {
		out[i] = t ^ 1
	}
	return out
}

// Variant is one of the 4 regulated-verse pattern variants per form.
type Variant struct {
	QiPing     bool  // 平起 or 仄起
	RhymeFirst bool  // 首句入韵
	Tones      []int // full L-length tone string
}

// BuildVariant builds the full tone string for one variant via 对 + 粘.
func BuildVariant(form FormDef, qiPing, rhymeFirst bool) Variant {
	head := 0
	if !qiPing {
		head = 1
	}
	tail := 1
	if rhymeFirst {
		tail = 0
	}
	lineArr := [][]int{makeLine(form.Cpl, head, tail)}
	prev := lineArr[0]
	for l := 1; l < form.Lines; l++ {
		var cur []int
		if l%2 == 1 {
			// 对句 (even line): oppose 出句, force 平收
			cur = oppose(prev)
			cur[len(cur)-1] = 0
		} else {
			// new couplet's 出句: 粘 prev 对句's 2nd-char tone, 仄收
			stick := prev[1]
			cur = makeLine(form.Cpl, stick, 1)
		}
		lineArr = append(lineArr, cur)
		prev = cur
	}
	// Flatten
	flat := make([]int, 0, form.L)
	for _, l := range lineArr {
		flat = append(flat, l...)
	}
	return Variant{QiPing: qiPing, RhymeFirst: rhymeFirst, Tones: flat}
}

var variantCache = map[FormId][]Variant{}

// VariantsFor returns the 4 variants for a form.
func VariantsFor(form FormDef) []Variant {
	if vs, ok := variantCache[form.ID]; ok {
		return vs
	}
	vs := make([]Variant, 0, 4)
	for _, qiPing := range []bool{false, true} {
		for _, rhymeFirst := range []bool{false, true} {
			vs = append(vs, BuildVariant(form, qiPing, rhymeFirst))
		}
	}
	variantCache[form.ID] = vs
	return vs
}

// RhymePositions returns the positions (0-based) of rhyming chars.
// Last char of even lines, plus line-1 if 首句入韵.
func RhymePositions(form FormDef, rhymeFirst bool) []int {
	r := make([]int, 0)
	for l := 0; l < form.Lines; l++ {
		if (l+1)%2 == 0 || (l == 0 && rhymeFirst) {
			r = append(r, l*form.Cpl+(form.Cpl-1))
		}
	}
	return r
}

// classifyPositions: 0=仄, 1=平 non-rhyme, 2=韵脚.
func classifyPositions(v Variant, rhymePos map[int]bool) []int8 {
	kind := make([]int8, len(v.Tones))
	for i, t := range v.Tones {
		if rhymePos[i] {
			kind[i] = 2
		} else if t == 1 {
			kind[i] = 0
		} else {
			kind[i] = 1
		}
	}
	return kind
}

type kindCount struct{ z, pf, rh int }

func countKinds(kind []int8) kindCount {
	var c kindCount
	for _, k := range kind {
		switch k {
		case 0:
			c.z++
		case 1:
			c.pf++
		case 2:
			c.rh++
		}
	}
	return c
}

// ── 格律 catalog = mixed-radix product ──
// |G_form| = Σ_variant Σ_韵部 ( Zsz^z · Psz^pf · r_q^rh )

// RegulatedSize returns the total number of 格律-valid poems for a form.
func RegulatedSize(lx Lexicon, form FormDef) *big.Int {
	Psz := big.NewInt(int64(len(lx.PingList)))
	Zsz := big.NewInt(int64(len(lx.ZeList)))
	total := new(big.Int)
	for _, v := range VariantsFor(form) {
		rp := make(map[int]bool)
		for _, p := range RhymePositions(form, v.RhymeFirst) {
			rp[p] = true
		}
		kc := countKinds(classifyPositions(v, rp))
		base := new(big.Int).Exp(Zsz, big.NewInt(int64(kc.z)), nil)
		base.Mul(base, new(big.Int).Exp(Psz, big.NewInt(int64(kc.pf)), nil))
		rhymeSum := new(big.Int)
		for _, members := range lx.RhymeMembers {
			rhymeSum.Add(rhymeSum, new(big.Int).Exp(big.NewInt(int64(len(members))), big.NewInt(int64(kc.rh)), nil))
		}
		total.Add(total, new(big.Int).Mul(base, rhymeSum))
	}
	return total
}

// Mixed-radix codec (LSB-first).
func mixedDecode(k *big.Int, radices []*big.Int) []*big.Int {
	d := make([]*big.Int, len(radices))
	rem := new(big.Int).Set(k)
	n := new(big.Int)
	for i, r := range radices {
		rem.DivMod(rem, r, n)
		d[i] = new(big.Int).Set(n)
	}
	return d
}

func mixedEncode(digits []*big.Int, radices []*big.Int) *big.Int {
	k := new(big.Int)
	for i := len(radices) - 1; i >= 0; i-- {
		k.Mul(k, radices[i])
		k.Add(k, digits[i])
	}
	return k
}

// RegulatedUnrank converts a 格律 index to a RegPoem.
func RegulatedUnrank(lx Lexicon, form FormDef, s *big.Int) RegPoem {
	variants := VariantsFor(form)
	Psz := big.NewInt(int64(len(lx.PingList)))
	Zsz := big.NewInt(int64(len(lx.ZeList)))
	var vIdx int = -1
	rem := new(big.Int).Set(s)
	for vi, v := range variants {
		rp := make(map[int]bool)
		for _, p := range RhymePositions(form, v.RhymeFirst) {
			rp[p] = true
		}
		kc := countKinds(classifyPositions(v, rp))
		base := new(big.Int).Exp(Zsz, big.NewInt(int64(kc.z)), nil)
		base.Mul(base, new(big.Int).Exp(Psz, big.NewInt(int64(kc.pf)), nil))
		vsize := new(big.Int)
		for _, members := range lx.RhymeMembers {
			vsize.Add(vsize, new(big.Int).Mul(base, new(big.Int).Exp(big.NewInt(int64(len(members))), big.NewInt(int64(kc.rh)), nil)))
		}
		if rem.Cmp(vsize) < 0 {
			vIdx = vi
			break
		}
		rem.Sub(rem, vsize)
	}
	if vIdx < 0 {
		panic("s out of range")
	}
	v := variants[vIdx]
	rp := make(map[int]bool)
	for _, p := range RhymePositions(form, v.RhymeFirst) {
		rp[p] = true
	}
	kind := classifyPositions(v, rp)
	kc := countKinds(kind)
	base := new(big.Int).Exp(Zsz, big.NewInt(int64(kc.z)), nil)
	base.Mul(base, new(big.Int).Exp(Psz, big.NewInt(int64(kc.pf)), nil))
	var q int = -1
	for qi := 0; qi < len(lx.RhymeMembers); qi++ {
		block := new(big.Int).Mul(base, new(big.Int).Exp(big.NewInt(int64(len(lx.RhymeMembers[qi]))), big.NewInt(int64(kc.rh)), nil))
		if rem.Cmp(block) < 0 {
			q = qi
			break
		}
		rem.Sub(rem, block)
	}
	if q < 0 {
		panic("rhyme index overflow")
	}
	Rsz := big.NewInt(int64(len(lx.RhymeMembers[q])))
	radices := make([]*big.Int, form.L)
	for i := 0; i < form.L; i++ {
		switch kind[i] {
		case 0:
			radices[i] = Zsz
		case 1:
			radices[i] = Psz
		default:
			radices[i] = Rsz
		}
	}
	digits := mixedDecode(rem, radices)
	chars := make([]int, form.L)
	for i := 0; i < form.L; i++ {
		d := int(digits[i].Int64())
		switch kind[i] {
		case 0:
			chars[i] = int(lx.ZeList[d])
		case 1:
			chars[i] = int(lx.PingList[d])
		default:
			chars[i] = int(lx.RhymeMembers[q][d])
		}
	}
	return RegPoem{Form: form.ID, Variant: vIdx, Rhyme: q, Chars: chars}
}

// RegulatedRank converts a RegPoem to its 格律 index.
func RegulatedRank(lx Lexicon, form FormDef, poem RegPoem) *big.Int {
	variants := VariantsFor(form)
	v := variants[poem.Variant]
	rp := make(map[int]bool)
	for _, p := range RhymePositions(form, v.RhymeFirst) {
		rp[p] = true
	}
	kind := classifyPositions(v, rp)
	kc := countKinds(kind)
	Psz := big.NewInt(int64(len(lx.PingList)))
	Zsz := big.NewInt(int64(len(lx.ZeList)))
	base := new(big.Int).Exp(Zsz, big.NewInt(int64(kc.z)), nil)
	base.Mul(base, new(big.Int).Exp(Psz, big.NewInt(int64(kc.pf)), nil))
	q := poem.Rhyme
	Rsz := big.NewInt(int64(len(lx.RhymeMembers[q])))
	radices := make([]*big.Int, form.L)
	digits := make([]*big.Int, form.L)
	for i := 0; i < form.L; i++ {
		c := poem.Chars[i]
		switch kind[i] {
		case 0:
			radices[i] = Zsz
			digits[i] = big.NewInt(int64(lx.ZeRank[c]))
		case 1:
			radices[i] = Psz
			digits[i] = big.NewInt(int64(lx.PingRank[c]))
		default:
			radices[i] = Rsz
			digits[i] = big.NewInt(int64(lx.RhymeRank[q][c]))
		}
	}
	inner := mixedEncode(digits, radices)
	for qi := 0; qi < q; qi++ {
		inner.Add(inner, new(big.Int).Mul(base, new(big.Int).Exp(big.NewInt(int64(len(lx.RhymeMembers[qi]))), big.NewInt(int64(kc.rh)), nil)))
	}
	off := new(big.Int)
	for vi := 0; vi < poem.Variant; vi++ {
		vv := variants[vi]
		rp2 := make(map[int]bool)
		for _, p := range RhymePositions(form, vv.RhymeFirst) {
			rp2[p] = true
		}
		ck := countKinds(classifyPositions(vv, rp2))
		b2 := new(big.Int).Exp(Zsz, big.NewInt(int64(ck.z)), nil)
		b2.Mul(b2, new(big.Int).Exp(Psz, big.NewInt(int64(ck.pf)), nil))
		for _, members := range lx.RhymeMembers {
			off.Add(off, new(big.Int).Mul(b2, new(big.Int).Exp(big.NewInt(int64(len(members))), big.NewInt(int64(ck.rh)), nil)))
		}
	}
	return off.Add(off, inner)
}

// ── Independent validator + variant matcher ──

// MatchVariant checks if a character sequence matches a 格律 variant.
func MatchVariant(lx Lexicon, form FormDef, chars []int) *RegPoem {
	variants := VariantsFor(form)
	for vi, v := range variants {
		ok := true
		for i := 0; i < form.L && ok; i++ {
			if int(lx.ToneClass[chars[i]]) != v.Tones[i] {
				ok = false
			}
		}
		if !ok {
			continue
		}
		rps := RhymePositions(form, v.RhymeFirst)
		q0 := int(lx.RhymeOf[chars[rps[0]]])
		if q0 < 0 {
			continue
		}
		same := true
		for _, p := range rps {
			if int(lx.RhymeOf[chars[p]]) != q0 {
				same = false
				break
			}
		}
		if !same {
			continue // 不押韵
		}
		return &RegPoem{Form: form.ID, Variant: vi, Rhyme: q0, Chars: chars}
	}
	return nil
}

// IsRegulated returns true if the chars match a 格律 variant.
func IsRegulated(lx Lexicon, form FormDef, chars []int) bool {
	return MatchVariant(lx, form, chars) != nil
}
