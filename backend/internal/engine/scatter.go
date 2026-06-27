package engine

import "math/big"

// ── Reversible scatter (BigInt Feistel + cycle-walk) ──

var (
	// bigInt constants, set via SetString to avoid int64 overflow.
	cU64        *big.Int
	cMixA       *big.Int
	cMul1       *big.Int
	cMul2       *big.Int
	cFeistelKey *big.Int
	c60         *big.Int
	c40         *big.Int
	cSeedMul1   int64 = 73856093
	cSeedMul2   int64 = 19349663
	cSeedMul3   int64 = 83492791
	cCtrMul     int64 = 0x100000001b3
)

func init() {
	cU64 = mustSet("ffffffffffffffff", 16)
	cMixA = mustSet("9e3779b97f4a7c15", 16)
	cMul1 = mustSet("bf58476d1ce4e5b9", 16)
	cMul2 = mustSet("94d049bb133111eb", 16)
	cFeistelKey = cMixA
	c60 = big.NewInt(60)
	c40 = big.NewInt(40)
}

func mustSet(s string, base int) *big.Int {
	v, ok := new(big.Int).SetString(s, base)
	if !ok {
		panic("bad big constant: " + s)
	}
	return v
}

func splitmix64(x *big.Int) *big.Int {
	z := new(big.Int).Add(x, cMixA)
	z.And(z, cU64)
	z.Xor(z, new(big.Int).Rsh(z, 30))
	z.Mul(z, cMul1)
	z.And(z, cU64)
	z.Xor(z, new(big.Int).Rsh(z, 27))
	z.Mul(z, cMul2)
	z.And(z, cU64)
	z.Xor(z, new(big.Int).Rsh(z, 31))
	z.And(z, cU64)
	return z
}

func roundFn(half, round, key *big.Int, mask *big.Int) *big.Int {
	v := new(big.Int).Xor(half, round)
	v.Xor(v, key)
	return new(big.Int).And(splitmix64(v), mask)
}

func feistelEnc(x *big.Int, b *big.Int, key *big.Int, rounds int) *big.Int {
	bUint := uint(b.Int64())
	mask := new(big.Int).Sub(new(big.Int).Lsh(big.NewInt(1), bUint), big.NewInt(1))
	L := new(big.Int).And(new(big.Int).Rsh(x, bUint), mask)
	R := new(big.Int).And(x, mask)
	for i := 0; i < rounds; i++ {
		t := new(big.Int).Xor(L, roundFn(R, big.NewInt(int64(i)), key, mask))
		L = R
		R = t
	}
	return new(big.Int).Or(new(big.Int).Lsh(L, bUint), R)
}

func feistelDec(y *big.Int, b *big.Int, key *big.Int, rounds int) *big.Int {
	bUint := uint(b.Int64())
	mask := new(big.Int).Sub(new(big.Int).Lsh(big.NewInt(1), bUint), big.NewInt(1))
	L := new(big.Int).And(new(big.Int).Rsh(y, bUint), mask)
	R := new(big.Int).And(y, mask)
	for i := rounds - 1; i >= 0; i-- {
		t := new(big.Int).Xor(R, roundFn(L, big.NewInt(int64(i)), key, mask))
		R = L
		L = t
	}
	return new(big.Int).Or(new(big.Int).Lsh(L, bUint), R)
}

func halfBits(M *big.Int) *big.Int {
	bits := new(big.Int)
	n := new(big.Int).Sub(M, big.NewInt(1))
	for n.Sign() > 0 {
		bits.Add(bits, big.NewInt(1))
		n.Rsh(n, 1)
	}
	bits.Add(bits, big.NewInt(1))
	bits.Rsh(bits, 1) // ceil(bitlen/2)
	return bits
}

// Scatter applies a reversible permutation (Feistel + cycle-walk) to x mod M.
func Scatter(M *big.Int, key *big.Int, x *big.Int) *big.Int {
	if M.Cmp(big.NewInt(1)) <= 0 {
		return new(big.Int).Set(x)
	}
	b := halfBits(M)
	y := feistelEnc(x, b, key, 4)
	for y.Cmp(M) >= 0 {
		y = feistelEnc(y, b, key, 4)
	}
	return y
}

// Unscatter reverses Scatter.
func Unscatter(M *big.Int, key *big.Int, y *big.Int) *big.Int {
	if M.Cmp(big.NewInt(1)) <= 0 {
		return new(big.Int).Set(y)
	}
	b := halfBits(M)
	x := feistelDec(y, b, key, 4)
	for x.Cmp(M) >= 0 {
		x = feistelDec(x, b, key, 4)
	}
	return x
}

// ── Index → 3D coordinate ──

func hashUnit(x *big.Int, salt int64) float64 {
	xor := new(big.Int).Xor(x, big.NewInt(salt*cSeedMul1))
	h := splitmix64(xor)
	maxF := float64(int64(1 << 53))
	return float64(new(big.Int).And(h, big.NewInt((1<<53)-1)).Int64()) / maxF
}

// IndexToPoint converts a scattered index to a 3D point within radius R.
func IndexToPoint(scatteredIndex *big.Int, R float64) Vec3 {
	return Vec3{
		X: (hashUnit(scatteredIndex, 1)*2 - 1) * R,
		Y: (hashUnit(scatteredIndex, 2)*2 - 1) * R,
		Z: (hashUnit(scatteredIndex, 3)*2 - 1) * R,
	}
}
