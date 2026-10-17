// Logical Reasoning: series, coding, ranking, directions and operations are
// computed; analogies, classification, relations, syllogisms and seating are
// built from small fact tables. Anything that needs a figure is left out.
import { between, Draft, mcq, mcqOf, nearBy, numeric, p, pick, shuffle, unique, type Four } from "./lib";

const SERIES = "Series (Number & Alphabet)";
const ANALOGY = "Analogy";
const ODD = "Classification (Odd One Out)";
const CODING = "Coding-Decoding";
const BLOOD = "Blood Relations";
const DIRECTION = "Direction & Distance";
const RANK = "Order & Ranking";
const SEATING = "Seating Arrangement & Puzzles";
const SYLLOGISM = "Syllogism & Statement-Conclusion";
const OPS = "Mathematical Operations";

const L = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const MEN = ["Ravi", "Amit", "Rahul", "Karan", "Vijay", "Suresh", "Arjun", "Manoj"];
const WOMEN = ["Priya", "Neha", "Pooja", "Kavita", "Anjali", "Sunita", "Meena", "Ritu"];

function seriesTerms(): { terms: number[]; next: number } {
  const kind = between(0, 5);
  const t: number[] = [];
  if (kind === 0) { const a = between(1, 30), d = between(2, 12); for (let i = 0; i < 6; i++) t.push(a + i * d); }
  if (kind === 1) { let x = between(1, 10); const d = between(1, 4), s = between(1, 3); for (let i = 0; i < 6; i++) { t.push(x); x += d + i * s; } }
  if (kind === 2) { const a = between(1, 5), r = between(2, 3); for (let i = 0; i < 6; i++) t.push(a * r ** i); }
  if (kind === 3) { const n = between(1, 8), c = between(0, 3); for (let i = 0; i < 6; i++) t.push((n + i) ** 2 + c); }
  if (kind === 4) { const n = between(1, 4); for (let i = 0; i < 6; i++) t.push((n + i) ** 3); }
  if (kind === 5) { let x = between(1, 6); const add = between(1, 5); for (let i = 0; i < 6; i++) { t.push(x); x = i % 2 === 0 ? x * 2 : x + add; } }
  return { terms: t.slice(0, 5), next: t[5] };
}

const shift = (w: string, k: number) => [...w].map((c) => L[(L.indexOf(c) + k + 26) % 26]).join("");
const rev = (w: string) => [...w].reverse().join("");
const WORDS = ["BOOK", "LAMP", "TREE", "FISH", "MILK", "ROSE", "GOLD", "BIRD", "CAKE", "DESK", "KING", "SHIP", "RAIN", "WIND", "FARM", "PLAY", "STAR", "MOON", "BLUE", "HAND", "WORD", "LIFE", "SALT", "ROAD"];

function syllogism(): Draft {
  const [x, y, z] = shuffle(pick([
    ["pens", "books", "bags"], ["roses", "flowers", "plants"], ["cars", "trucks", "buses"],
    ["chairs", "tables", "desks"], ["doctors", "teachers", "singers"], ["apples", "fruits", "seeds"],
    ["rivers", "lakes", "ponds"], ["phones", "radios", "watches"], ["kings", "queens", "soldiers"],
  ]));
  const forms: [string[], [string, boolean], [string, boolean]][] = [
    [[`All ${x} are ${y}.`, `All ${y} are ${z}.`], [`All ${x} are ${z}.`, true], [`Some ${z} are ${x}.`, true]],
    [[`Some ${x} are ${y}.`, `All ${y} are ${z}.`], [`Some ${x} are ${z}.`, true], [`All ${z} are ${x}.`, false]],
    [[`No ${x} are ${y}.`, `All ${z} are ${x}.`], [`No ${z} are ${y}.`, true], [`Some ${y} are ${x}.`, false]],
    [[`Some ${x} are ${y}.`, `Some ${y} are ${z}.`], [`Some ${x} are ${z}.`, false], [`All ${z} are ${y}.`, false]],
    [[`All ${x} are ${y}.`, `Some ${y} are ${z}.`], [`Some ${z} are ${x}.`, false], [`Some ${y} are ${x}.`, true]],
    [[`All ${x} are ${y}.`, `No ${y} are ${z}.`], [`No ${x} are ${z}.`, true], [`No ${z} are ${x}.`, true]],
  ];
  const [statements, c1, c2] = pick(forms);
  const [first, second] = rand2() ? [c1, c2] : [c2, c1];
  const correct = first[1] && second[1] ? "C" : first[1] ? "A" : second[1] ? "B" : "D";
  return {
    topic: SYLLOGISM, difficulty: "MEDIUM", type: "SYLLOGISM", correct,
    text: p("Read the statements and decide which conclusion(s) logically follow."),
    options: ["Only conclusion I follows", "Only conclusion II follows", "Both I and II follow", "Neither I nor II follows"],
    structuredData: { statements, conclusions: [`I. ${first[0]}`, `II. ${second[0]}`] },
  };
}
const rand2 = () => between(0, 1) === 1;

const ANALOGY_GROUPS: [string, string][][] = [
  [["Cow", "Calf"], ["Dog", "Puppy"], ["Cat", "Kitten"], ["Horse", "Foal"], ["Sheep", "Lamb"], ["Lion", "Cub"], ["Hen", "Chick"], ["Frog", "Tadpole"], ["Duck", "Duckling"]],
  [["Bird", "Nest"], ["Bee", "Hive"], ["Lion", "Den"], ["Horse", "Stable"], ["Rabbit", "Burrow"], ["Spider", "Web"], ["Dog", "Kennel"], ["Pig", "Sty"]],
  [["Doctor", "Hospital"], ["Teacher", "School"], ["Farmer", "Field"], ["Chef", "Kitchen"], ["Pilot", "Cockpit"], ["Judge", "Court"], ["Actor", "Stage"], ["Sailor", "Ship"]],
  [["Dog", "Bark"], ["Cat", "Meow"], ["Lion", "Roar"], ["Snake", "Hiss"], ["Horse", "Neigh"], ["Duck", "Quack"], ["Owl", "Hoot"]],
  [["Pen", "Write"], ["Knife", "Cut"], ["Broom", "Sweep"], ["Needle", "Sew"], ["Spade", "Dig"], ["Brush", "Paint"], ["Saw", "Cut wood"]],
];

const CATEGORIES: Record<string, string[]> = {
  fruit: ["Apple", "Mango", "Banana", "Grapes", "Papaya", "Guava", "Pear"],
  vegetable: ["Potato", "Carrot", "Cabbage", "Spinach", "Brinjal", "Onion"],
  animal: ["Lion", "Tiger", "Elephant", "Zebra", "Giraffe", "Deer"],
  bird: ["Sparrow", "Parrot", "Crow", "Eagle", "Pigeon", "Peacock"],
  instrument: ["Guitar", "Violin", "Flute", "Sitar", "Tabla", "Piano"],
  planet: ["Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Neptune"],
  metal: ["Iron", "Copper", "Gold", "Silver", "Zinc", "Aluminium"],
  colour: ["Red", "Blue", "Green", "Yellow", "Purple", "Pink"],
};

type G = "M" | "F";
const BLOOD_TEMPLATES: { g: [G, G, G]; text: string; answer: string }[] = [
  { g: ["M", "F", "M"], text: "{A} is the brother of {B}. {B} is the daughter of {C}. How is {A} related to {C}?", answer: "Son" },
  { g: ["F", "M", "F"], text: "{A} is the sister of {B}. {B} is the son of {C}. How is {A} related to {C}?", answer: "Daughter" },
  { g: ["M", "M", "M"], text: "{A} is the father of {B}. {B} is the father of {C}. How is {A} related to {C}?", answer: "Grandfather" },
  { g: ["F", "F", "M"], text: "{A} is the mother of {B}. {B} is the sister of {C}. How is {A} related to {C}?", answer: "Mother" },
  { g: ["M", "M", "M"], text: "{A} is the son of {B}. {C} is the brother of {B}. How is {C} related to {A}?", answer: "Uncle" },
  { g: ["F", "M", "F"], text: "{A} is the wife of {B}. {B} is the father of {C}. How is {A} related to {C}?", answer: "Mother" },
  { g: ["F", "F", "M"], text: "{A} is the daughter of {B}. {B} is the sister of {C}. How is {A} related to {C}?", answer: "Niece" },
  { g: ["M", "F", "F"], text: "{A} is the husband of {B}. {B} is the mother of {C}. How is {A} related to {C}?", answer: "Father" },
  { g: ["F", "M", "M"], text: "{A} is the sister of {B}. {B} is the father of {C}. How is {A} related to {C}?", answer: "Aunt" },
  { g: ["M", "F", "M"], text: "{A} is the son of {B}. {B} is the sister of {C}. How is {A} related to {C}?", answer: "Nephew" },
];
const RELATIONS = ["Son", "Daughter", "Brother", "Sister", "Father", "Mother", "Uncle", "Aunt", "Nephew", "Niece", "Grandfather", "Cousin"];

const DIRS = ["North", "East", "South", "West"];
const DIRS_HI = ["उत्तर", "पूर्व", "दक्षिण", "पश्चिम"];

export function reasoningFamilies(): Draft[][] {
  return [
    unique(44, () => {
      const { terms, next } = seriesTerms();
      const missing = rand2();
      if (missing) {
        const all = [...terms, next];
        const ans = all[2];
        const shown = all.map((t, i) => (i === 2 ? "?" : String(t))).join(", ");
        return numeric(SERIES, "MEDIUM", `Find the missing number: ${shown}`, `लुप्त संख्या ज्ञात कीजिए: ${shown}`,
          String(ans), nearBy(ans).map(String));
      }
      return numeric(SERIES, "EASY", `Find the next term: ${terms.join(", ")}, ?`, `अगला पद ज्ञात कीजिए: ${terms.join(", ")}, ?`,
        String(next), nearBy(next).map(String));
    }),

    unique(10, () => {
      const k = between(1, 4), grow = rand2();
      const idx: number[] = [between(0, 5)];
      for (let i = 1; i < 5; i++) idx.push(idx[i - 1] + (grow ? k + i - 1 : k));
      if (idx[4] > 25) return letterSeries([0, 2, 4, 6, 8]);
      return letterSeries(idx);
    }),

    unique(6, () => {
      const g = between(1, 3);
      const starts = shuffle(Array.from({ length: 20 }, (_, i) => i)).slice(0, 4);
      const pair = (s: number, gap: number) => L[s] + L[s + gap];
      const { options, correct } = mcq(pair(starts[3], g + 1), starts.slice(0, 3).map((s) => pair(s, g)));
      return { topic: ODD, difficulty: "MEDIUM" as const, text: p(`Find the odd one out: ${options.join(", ")}`), options, correct,
        solution: p(`The others skip ${g - 1 === 0 ? "no letters" : `${g - 1} letter${g > 2 ? "s" : ""}`}; this one skips ${g}.`) };
    }),

    unique(14, () => {
      const [w1, w2] = shuffle(WORDS).slice(0, 2);
      const k = pick([1, 2, 3, -1]);
      const right = shift(w2, k);
      const wrong = [shift(w2, k + 1), shift(w2, k === 1 ? 2 : k - 1), rev(right), shift(rev(w2), k), shift(w2, -k)];
      return numeric(CODING, "MEDIUM", `If ${w1} is coded as ${shift(w1, k)}, how is ${w2} coded?`,
        `यदि किसी कूट भाषा में ${w1} को ${shift(w1, k)} लिखा जाता है, तो उसी भाषा में ${w2} को कैसे लिखा जाएगा?`,
        right, wrong, `Each letter moves ${Math.abs(k)} place${Math.abs(k) > 1 ? "s" : ""} ${k > 0 ? "forward" : "back"}.`);
    }),

    unique(6, () => {
      const w = pick(WORDS);
      const v = [...w].reduce((s, c) => s + L.indexOf(c) + 1, 0);
      return numeric(CODING, "EASY", `If A = 1, B = 2, C = 3 and so on, what is the value of ${w}?`,
        `यदि A = 1, B = 2, C = 3 इत्यादि हो, तो ${w} का मान क्या होगा?`, String(v), nearBy(v).map(String),
        `${[...w].map((c) => L.indexOf(c) + 1).join(" + ")} = ${v}.`);
    }),

    unique(8, () => {
      const male = rand2(), name = pick(male ? MEN : WOMEN), a = between(4, 25), b = between(4, 25);
      return numeric(RANK, "EASY", `${name} is ${ord(a)} from the left and ${ord(b)} from the right in a row. How many people are in the row?`,
        `${name} एक पंक्ति में बाएँ से ${a}वें और दाएँ से ${b}वें स्थान पर है। पंक्ति में कुल कितने व्यक्ति हैं?`,
        String(a + b - 1), [a + b, a + b - 2, a + b + 1, a + b - 3].map(String), `Total = ${a} + ${b} − 1 = ${a + b - 1}.`);
    }),

    unique(6, () => {
      const name = pick([...MEN, ...WOMEN]), n = between(20, 60), a = between(3, n - 3);
      return numeric(RANK, "EASY", `In a row of ${n} students, ${name} is ${ord(a)} from the left. What is ${name}'s position from the right?`,
        `${n} विद्यार्थियों की एक पंक्ति में ${name} बाएँ से ${a}वें स्थान पर है। दाएँ से उसका स्थान क्या है?`,
        String(n - a + 1), [n - a, n - a + 2, a, n - a - 1].map(String), `Position from right = ${n} − ${a} + 1 = ${n - a + 1}.`);
    }),

    unique(10, () => {
      const male = rand2(), name = pick(male ? MEN : WOMEN);
      const [diff, b, dist] = pick([[3, 4, 5], [4, 3, 5], [6, 8, 10], [8, 6, 10], [5, 12, 13], [0, 7, 7], [0, 4, 4]]);
      const c = between(2, 9), a = c + diff;
      const v = male ? "चलता" : "चलती";
      return numeric(DIRECTION, diff ? "MEDIUM" : "EASY",
        `${name} walks ${a} km north, turns right and walks ${b} km, then turns right again and walks ${c} km. How far is ${male ? "he" : "she"} from the starting point?`,
        `${name} ${a} किमी उत्तर की ओर ${v} है, फिर दाएँ मुड़कर ${b} किमी ${v} है, फिर दोबारा दाएँ मुड़कर ${c} किमी ${v} है। वह आरंभिक बिंदु से कितनी दूर है?`,
        `${dist} km`, [a + b + c, b + diff + 1, dist + 1, a + c, b + 2].filter((x) => x !== dist).map((x) => `${x} km`),
        `${diff} km north and ${b} km east of the start: √(${diff}² + ${b}²) = ${dist} km.`);
    }),

    unique(8, () => {
      const male = rand2(), name = pick(male ? MEN : WOMEN), start = between(0, 3);
      const turns = Array.from({ length: between(2, 4) }, () => pick(["right", "left", "around"] as const));
      const end = turns.reduce((d, t) => (d + (t === "right" ? 1 : t === "left" ? 3 : 2)) % 4, start);
      const en = turns.map((t) => (t === "around" ? "turns around" : `turns ${t}`)).join(", then ");
      const turn = male ? "मुड़ता है" : "मुड़ती है";
      const hi = turns.map((t) => `${t === "around" ? "पीछे" : t === "right" ? "दाएँ" : "बाएँ"} ${turn}`).join(", फिर ");
      const { items, correct } = mcqOf(end, [0, 1, 2, 3].filter((d) => d !== end), (d) => DIRS[d]);
      return {
        topic: DIRECTION, difficulty: "EASY" as const, correct,
        text: p(`${name} is facing ${DIRS[start]}. ${male ? "He" : "She"} ${en}. Which direction is ${male ? "he" : "she"} facing now?`),
        options: items.map((d) => DIRS[d]) as Four,
        hi: {
          text: p(`${name} ${DIRS_HI[start]} की ओर मुँह करके ${male ? "खड़ा" : "खड़ी"} है। वह ${hi}। अब उसका मुँह किस दिशा में है?`),
          options: items.map((d) => DIRS_HI[d]) as Four,
        },
      };
    }),

    unique(12, () => {
      // Shown symbol -> real operation: + is ×, × is −, − is ÷, ÷ is +.
      const toShown: Record<string, string> = { "×": "+", "−": "×", "÷": "−", "+": "÷" };
      let real: string[], value: number;
      if (rand2()) {
        const a = between(2, 12), b = between(2, 12), c = between(1, Math.min(20, a * b - 1)), d = between(1, 20);
        real = [String(a), "×", String(b), "−", String(c), "+", String(d)];
        value = a * b - c + d;
      } else {
        const b = between(2, 9), a = b * between(2, 10), c = between(2, 9), d = between(2, 9);
        real = [String(a), "÷", String(b), "+", String(c), "×", String(d)];
        value = a / b + c * d;
      }
      const shown = real.map((t) => toShown[t] ?? t).join(" ");
      return numeric(OPS, "MEDIUM",
        `If '+' means '×', '×' means '−', '−' means '÷' and '÷' means '+', what is the value of ${shown}?`,
        `यदि '+' का अर्थ '×', '×' का अर्थ '−', '−' का अर्थ '÷' और '÷' का अर्थ '+' हो, तो ${shown} का मान क्या होगा?`,
        String(value), nearBy(value).map(String), `Decoded: ${real.join(" ")} = ${value}.`);
    }),

    unique(6, () => {
      const [f, name] = pick([[(n: number) => n * n, "square"], [(n: number) => n ** 3, "cube"], [(n: number) => n * n + 1, "square plus one"]] as const);
      const a = between(2, 9), b = pick([2, 3, 4, 5, 6, 7, 8, 9, 10, 11].filter((x) => x !== a));
      return numeric(ANALOGY, "EASY", `${a} : ${f(a)} :: ${b} : ?`, null, String(f(b)), nearBy(f(b)).map(String),
        `Each second number is the ${name} of the first.`);
    }),

    ANALOGY_GROUPS.flatMap((group) => group.map((target, i) => {
      const example = group[(i + 1) % group.length];
      const { options, correct } = mcq(target[1], group.filter((g) => g !== target).map((g) => g[1]));
      return { topic: ANALOGY, difficulty: "EASY" as const, text: p(`${example[0]} : ${example[1]} :: ${target[0]} : ?`), options, correct };
    })),

    unique(14, () => {
      const [main, other] = shuffle(Object.keys(CATEGORIES)).slice(0, 2);
      const { options, correct } = mcq(pick(CATEGORIES[other]), shuffle(CATEGORIES[main]).slice(0, 3));
      return { topic: ODD, difficulty: "EASY" as const, text: p(`Find the odd one out: ${options.join(", ")}`), options, correct };
    }),

    unique(10, () => {
      const t = pick(BLOOD_TEMPLATES);
      const men = shuffle(MEN), women = shuffle(WOMEN);
      const [A, B, C] = t.g.map((g) => (g === "M" ? men : women).pop()!);
      const { options, correct } = mcq(t.answer, RELATIONS.filter((r) => r !== t.answer));
      return { topic: BLOOD, difficulty: "MEDIUM" as const, text: p(t.text.replace(/{A}/g, A).replace(/{B}/g, B).replace(/{C}/g, C)), options, correct };
    }),

    unique(12, syllogism),

    unique(8, () => {
      const row = shuffle(["P", "Q", "R", "S", "T", "U", "V"]).slice(0, 5);
      const clues = rand2()
        ? { text: `${row[2]} sits in the middle. ${row[1]} is to the immediate left of ${row[2]}. ${row[4]} sits at the right end. ${row[3]} is to the immediate right of ${row[2]}. Who sits at the left end?`, answer: row[0] }
        : { text: `${row[2]} sits in the middle. ${row[0]} sits at the left end. ${row[1]} is to the immediate left of ${row[2]}. ${row[4]} sits at the right end. Who sits second from the right?`, answer: row[3] };
      const { options, correct } = mcq(clues.answer, row.filter((r) => r !== clues.answer));
      return { topic: SEATING, difficulty: "MEDIUM" as const, text: p(`Five friends ${[...row].sort().join(", ")} sit in a row facing north. ${clues.text}`), options, correct };
    }),
  ];
}

function letterSeries(idx: number[]): Draft {
  const ans = idx[4];
  const shown = idx.slice(0, 4).map((i) => L[i]).join(", ");
  return numeric(SERIES, "MEDIUM", `Find the next letter: ${shown}, ?`, `अगला अक्षर ज्ञात कीजिए: ${shown}, ?`,
    L[ans], [ans - 2, ans - 1, ans + 1, ans + 2].filter((i) => i >= 0 && i < 26).map((i) => L[i]));
}

function ord(n: number) {
  const s = n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th";
  return `${n}${s}`;
}
