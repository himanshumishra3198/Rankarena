// CAT Data Interpretation & Logical Reasoning: every set is a passage or data
// table with four questions hanging off it, as on the real paper, and every
// answer is computed from the data the set was generated with. The names are
// letters and made-up clubs and papers, so nothing reads as a real statistic.
import { between, mcq, nearBy, p, pick, rand, shuffle, type CatDraft, type CatSet } from "./lib";

function onTable(difficulty: CatDraft["difficulty"], text: string, right: string, wrong: string[], solution: string, topic: string): CatDraft {
  const { options, correct } = mcq(right, wrong);
  return { type: "TABLE", topic, skill: "Data Extraction", difficulty, text: p(text), options, correct, solution: p(solution) };
}

function onPassage(difficulty: CatDraft["difficulty"], text: string, right: string, wrong: string[], solution: string, topic: string): CatDraft {
  const { options, correct } = mcq(right, wrong);
  return { type: "PASSAGE", topic, difficulty, text: p(text), options, correct, solution: p(solution) };
}

function typeIn(difficulty: CatDraft["difficulty"], text: string, answer: number, solution: string, topic: string): CatDraft {
  return { type: "TITA", topic, difficulty, text: p(text), tita: { kind: "NUMERIC", accepted: [String(answer)] }, solution: p(solution) };
}

const WORDS = ["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight"];
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
/** Index of the largest value, or -1 when it is shared — a question needs one answer. */
function uniqueMax(xs: number[]): number {
  const max = Math.max(...xs);
  return xs.filter((x) => x === max).length === 1 ? xs.indexOf(max) : -1;
}

// ── Tables ──────────────────────────────────────────────────────────────────

/** Growth figures that come out whole: [first year, last year, % growth]. */
const GROWTH: [number, number, number][] = [
  [20, 25, 25], [20, 30, 50], [20, 35, 75], [40, 60, 50], [40, 70, 75], [40, 80, 100],
  [60, 75, 25], [60, 90, 50], [80, 100, 25], [80, 120, 50],
];

function tableSet(title: string, [rowLabel, plural]: [string, string], names: string[], years: string[], unit: string): CatSet {
  let data: number[][] = [];
  let grow = 0, growth: [number, number, number] = GROWTH[0];
  while (true) {
    data = names.map(() => years.map(() => between(4, 24) * 5));
    grow = between(0, names.length - 1);
    growth = pick(GROWTH);
    data[grow][0] = growth[0];
    data[grow][years.length - 1] = growth[1];
    if (uniqueMax(data.map(sum)) >= 0 && uniqueMax(years.map((_, y) => sum(data.map((r) => r[y])))) >= 0) break;
  }
  const totals = data.map(sum);
  const top = uniqueMax(totals);
  const yearTotals = years.map((_, y) => sum(data.map((r) => r[y])));
  const topYear = uniqueMax(yearTotals);
  const [a, b] = shuffle(names.map((_, i) => i)).slice(0, 2);
  const ahead = years.filter((_, y) => data[a][y] > data[b][y]).length;
  const first = years[0], last = years[years.length - 1];

  return {
    passage: {
      title,
      content: `The table shows the ${unit} of five ${plural} from ${first} to ${last}.`,
      type: "TABLE",
      tableData: { headers: [rowLabel[0].toUpperCase() + rowLabel.slice(1), ...years], rows: names.map((n, i) => [n, ...data[i].map(String)]) },
    },
    questions: [
      onTable("EASY", `Which ${rowLabel} had the highest total over the ${years.length} years?`,
        names[top], names.filter((_, i) => i !== top),
        `Totals: ${names.map((n, i) => `${n} ${totals[i]}`).join(", ")}. The highest is ${names[top]}.`, "Tables"),
      typeIn("MEDIUM", `By what percentage did the figure for ${names[grow]} grow from ${first} to ${last}?`, growth[2],
        `From ${growth[0]} to ${growth[1]} is a rise of ${growth[1] - growth[0]} on ${growth[0]}, i.e. ${growth[2]}%.`, "Tables"),
      typeIn("MEDIUM", `In how many of the ${years.length} years was the figure for ${names[a]} higher than that for ${names[b]}?`, ahead,
        `Year by year: ${years.map((y, i) => `${y} ${data[a][i]} vs ${data[b][i]}`).join("; ")} — ${names[a]} is ahead in ${ahead}.`, "Tables"),
      onTable("MEDIUM", `In which year was the combined figure for all five ${plural} the highest?`,
        years[topYear], years.filter((_, i) => i !== topYear),
        `Yearly totals: ${years.map((y, i) => `${y} ${yearTotals[i]}`).join(", ")}.`, "Tables"),
    ],
  };
}

// ── Venn diagrams ───────────────────────────────────────────────────────────

function vennSet(title: string, intro: (n: number) => string, groups: [string, string, string], member: string): CatSet {
  const [x, y, z] = groups;
  const only = [between(8, 25), between(8, 25), between(8, 25)];
  const xy = between(3, 10), yz = between(3, 10), xz = between(3, 10), all = between(2, 8), none = between(5, 20);
  const n = sum(only) + xy + yz + xz + all + none;
  const sizes = [only[0] + xy + xz + all, only[1] + xy + yz + all, only[2] + yz + xz + all];
  const exactlyOne = sum(only), atLeastTwo = xy + yz + xz + all;

  return {
    passage: {
      title,
      content: [
        `${intro(n)}`,
        `${sizes[0]} ${member} ${x}, ${sizes[1]} ${member} ${y} and ${sizes[2]} ${member} ${z}.`,
        `${xy + all} ${member} both ${x} and ${y}, ${yz + all} both ${y} and ${z}, and ${xz + all} both ${x} and ${z}. These figures include the ${all} who ${member} all three.`,
      ].join("\n\n"),
      type: "TEXT",
      tableData: null,
    },
    questions: [
      typeIn("MEDIUM", `How many of the ${n} ${member} none of the three?`, none,
        `By inclusion–exclusion, ${sizes.join(" + ")} − ${xy + all} − ${yz + all} − ${xz + all} + ${all} = ${n - none} ${member} at least one, so ${none} ${member} none.`, "Venn Diagrams"),
      onPassage("MEDIUM", `How many ${member} exactly one of the three?`, String(exactlyOne), nearBy(exactlyOne).map(String),
        `Only ${x}: ${only[0]}, only ${y}: ${only[1]}, only ${z}: ${only[2]} — ${exactlyOne} in all.`, "Venn Diagrams"),
      typeIn("EASY", `How many ${member} ${y} and neither of the other two?`, only[1],
        `${sizes[1]} − ${xy} (with ${x} only) − ${yz} (with ${z} only) − ${all} (all three) = ${only[1]}.`, "Venn Diagrams"),
      onPassage("HARD", `How many ${member} at least two of the three?`, String(atLeastTwo), [...nearBy(atLeastTwo), xy + yz + xz + 3 * all].map(String),
        `Exactly two: ${xy} + ${yz} + ${xz}; all three: ${all}. Total ${atLeastTwo}. Adding the pairwise figures directly would count the ${all} three times.`, "Venn Diagrams"),
    ],
  };
}

// ── Round-robin league ──────────────────────────────────────────────────────

function leagueSet(title: string, sport: string, teams: string[]): CatSet {
  type Result = { home: number; away: number; outcome: "H" | "A" | "D" };
  let results: Result[] = [];
  let points: number[] = [];
  while (true) {
    results = [];
    for (let i = 0; i < teams.length; i++)
      for (let j = i + 1; j < teams.length; j++) {
        const r = rand();
        results.push({ home: i, away: j, outcome: r < 0.25 ? "D" : r < 0.625 ? "H" : "A" });
      }
    points = teams.map((_, t) =>
      sum(results.map((r) => (r.outcome === "D" && (r.home === t || r.away === t) ? 1
        : (r.outcome === "H" && r.home === t) || (r.outcome === "A" && r.away === t) ? 3 : 0))));
    const draws = results.filter((r) => r.outcome === "D").length;
    if (uniqueMax(points) >= 0 && draws >= 1 && draws <= 4) break;
  }
  const top = uniqueMax(points);
  const draws = results.filter((r) => r.outcome === "D").length;
  const asked = between(0, teams.length - 1);
  const threshold = [...points].sort((a, b) => b - a)[2];
  const atLeast = points.filter((x) => x >= threshold).length;

  const line = (r: Result) =>
    r.outcome === "D" ? `${teams[r.home]} drew with ${teams[r.away]}.`
      : r.outcome === "H" ? `${teams[r.home]} beat ${teams[r.away]}.` : `${teams[r.away]} beat ${teams[r.home]}.`;
  const table = teams.map((t, i) => `${t} ${points[i]}`).join(", ");

  return {
    passage: {
      title,
      content: [
        `${WORDS[teams.length]} teams — ${teams.slice(0, -1).join(", ")} and ${teams[teams.length - 1]} — played a ${sport} league in which every team played every other team exactly once. A win earned 3 points, a draw 1 point and a loss 0 points.`,
        `The results of the ${results.length} matches, in the order they were played:\n` + shuffle(results).map(line).join("\n"),
      ].join("\n\n"),
      type: "TEXT",
      tableData: null,
    },
    questions: [
      onPassage("MEDIUM", "Which team finished with the most points?", teams[top], teams.filter((_, i) => i !== top),
        `Points: ${table}.`, "Games & Tournaments"),
      typeIn("EASY", `How many points did ${teams[asked]} finish with?`, points[asked],
        `Points: ${table}.`, "Games & Tournaments"),
      typeIn("EASY", "How many matches ended in a draw?", draws,
        `${draws} of the ${results.length} results are draws.`, "Games & Tournaments"),
      onPassage("HARD", `How many teams finished with ${threshold} points or more?`, String(atLeast), [1, 2, 3, 4, 5].filter((x) => x !== atLeast).map(String),
        `Points: ${table}. ${atLeast} teams have at least ${threshold}.`, "Games & Tournaments"),
    ],
  };
}

// ── Road network ────────────────────────────────────────────────────────────

function routesSet(title: string, towns: string[]): CatSet {
  const n = towns.length;
  // A ring keeps every town reachable; chords add the shortcuts that make
  // "shortest" a question rather than a reading.
  const roads: [number, number, number][] = towns.map((_, i) => [i, (i + 1) % n, between(4, 15)]);
  for (const [a, b] of shuffle([[0, 2], [0, 3], [1, 4], [2, 5], [1, 3], [3, 5]]).slice(0, 3)) roads.push([a, b, between(6, 20)]);

  const shortest = (closed?: number) => {
    const d = towns.map((_, i) => towns.map((_, j) => (i === j ? 0 : Infinity)));
    roads.forEach(([a, b, km], idx) => {
      if (idx === closed) return;
      d[a][b] = Math.min(d[a][b], km);
      d[b][a] = Math.min(d[b][a], km);
    });
    for (let k = 0; k < n; k++) for (let i = 0; i < n; i++) for (let j = 0; j < n; j++)
      if (d[i][k] + d[k][j] < d[i][j]) d[i][j] = d[i][k] + d[k][j];
    return d;
  };
  const d = shortest();
  const [s, t] = [0, 3];
  const [u, v] = [1, 4];
  const within = between(15, 25);
  const reach = towns.filter((_, j) => j !== 0 && d[0][j] <= within).length;
  // Close a road the shortest route depends on, so the question asks for the
  // detour rather than repeating the first answer.
  const closed = Math.max(0, roads.findIndex((_, i) => shortest(i)[s][t] > d[s][t]));
  const after = shortest(closed)[s][t];

  return {
    passage: {
      title,
      content: `The table lists every road between ${WORDS[n].toLowerCase()} towns and its length in kilometres. Roads can be used in either direction, and there are no other roads.`,
      type: "TABLE",
      tableData: { headers: ["Road", "Length (km)"], rows: roads.map(([a, b, km]) => [`${towns[a]} – ${towns[b]}`, String(km)]) },
    },
    questions: [
      typeIn("MEDIUM", `What is the length, in km, of the shortest route from ${towns[s]} to ${towns[t]}?`, d[s][t],
        `Comparing the routes through the network, the shortest from ${towns[s]} to ${towns[t]} is ${d[s][t]} km.`, "Routes & Networks"),
      onTable("MEDIUM", `What is the length of the shortest route from ${towns[u]} to ${towns[v]}?`,
        `${d[u][v]} km`, nearBy(d[u][v]).map((x) => `${x} km`),
        `The shortest route from ${towns[u]} to ${towns[v]} is ${d[u][v]} km.`, "Routes & Networks"),
      typeIn("HARD", `If the road ${towns[roads[closed][0]]} – ${towns[roads[closed][1]]} is closed, what is the length, in km, of the shortest route from ${towns[s]} to ${towns[t]}?`, after,
        after > d[s][t]
          ? `The shortest route used that road. Without it, the best route from ${towns[s]} to ${towns[t]} is ${after} km.`
          : `Another route of the same length avoids that road, so the answer is still ${after} km.`, "Routes & Networks"),
      onTable("MEDIUM", `How many of the other towns can be reached from ${towns[0]} by a route of ${within} km or less?`,
        String(reach), [0, 1, 2, 3, 4, 5].filter((x) => x !== reach).map(String),
        `Shortest distances from ${towns[0]}: ${towns.slice(1).map((tn, j) => `${tn} ${d[0][j + 1]}`).join(", ")}.`, "Routes & Networks"),
    ],
  };
}

/** Seven sets: two per paper for three papers, and one left in the bank. */
export function catDilrSets(): CatSet[] {
  return [
    tableSet("Revenue of five companies (₹ crore)", ["company", "companies"], ["P", "Q", "R", "S", "T"], ["2021", "2022", "2023", "2024"], "revenue in ₹ crore"),
    vennSet("Club membership survey",
      (n) => `A college asked all ${n} of its first-year students which of three clubs they belong to: Music, Drama and Sports.`,
      ["Music", "Drama", "Sports"], "belong to"),
    tableSet("Output of five factories (thousand units)", ["factory", "factories"], ["F1", "F2", "F3", "F4", "F5"], ["2020", "2021", "2022", "2023"], "output in thousand units"),
    leagueSet("A hockey league", "hockey", ["Lions", "Tigers", "Eagles", "Sharks", "Wolves"]),
    leagueSet("A football league", "football", ["Red", "Blue", "Green", "Gold", "White"]),
    routesSet("Roads between six towns", ["A", "B", "C", "D", "E", "F"]),
    vennSet("Newspaper readership",
      (n) => `A survey of ${n} households in a town asked which of three newspapers they read: the Morning Post, the Evening Star and the Weekly Courier.`,
      ["the Morning Post", "the Evening Star", "the Weekly Courier"], "read"),
  ];
}
