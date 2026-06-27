package engine

// Lexicon mirrors the TS Lexicon interface. Maps charId → tone/rhyme data
// for the 格律 (regulated-verse) catalog.
type Lexicon struct {
	N            int        // alphabet size
	PingList     []uint32   // 平-tone char-ids, sorted asc
	ZeList       []uint32   // 仄-tone char-ids, sorted asc
	PingRank     []int32    // global charId → index in pingList (-1 if !平)
	ZeRank       []int32    // global charId → index in zeList (-1 if !仄)
	ToneClass    []int8     // global charId → 0=平 1=仄
	RhymeOf      []int16    // global charId → 平声韵部 id, -1 if none
	RhymeMembers [][]uint32 // [韵部] 平-tone char-ids in that 韵部
	RhymeRank    [][]int32  // [韵部] charId → index in rhymeMembers (-1)
}

// FormId identifies one of the four 近体诗 forms.
type FormId = string

const (
	Wujue FormId = "wujue"
	Qijue FormId = "qijue"
	Wulu  FormId = "wulu"
	Qilu  FormId = "qilu"
)

// FormDef describes a regulated-verse form.
type FormDef struct {
	ID    FormId
	Lines int // line count
	Cpl   int // chars per line
	L     int // total chars
}

// FORMS maps each FormId to its definition.
var FORMS = map[FormId]FormDef{
	Wujue: {ID: Wujue, Lines: 4, Cpl: 5, L: 20},
	Qijue: {ID: Qijue, Lines: 4, Cpl: 7, L: 28},
	Wulu:  {ID: Wulu, Lines: 8, Cpl: 5, L: 40},
	Qilu:  {ID: Qilu, Lines: 8, Cpl: 7, L: 56},
}

// RegPoem is a poem validated against a 格律 variant.
type RegPoem struct {
	Form    FormId
	Variant int
	Rhyme   int // 韵部 index
	Chars   []int
}

// Vec3 is a 3D point.
type Vec3 struct {
	X, Y, Z float64
}

// PullForm is the UI-facing form union (4 regulated + "ziyou").
type PullForm = string

const PullZiyou PullForm = "ziyou"
