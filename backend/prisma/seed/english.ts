// English Language: built from word lists and sentence tables. English
// questions are not translated — the section is a test of English.
import { Draft, family, mcq, p, pick, shuffle, type Four } from "./lib";

const SYN_ANT = "Synonyms & Antonyms";

// Synonym distractors come from the antonym answers and the other way round,
// so a wrong option is never a near-synonym of the right one by accident.
const SYNONYMS: [string, string][] = [
  ["ABANDON", "Forsake"], ["BRIEF", "Concise"], ["CANDID", "Frank"], ["DILIGENT", "Hardworking"],
  ["EMINENT", "Distinguished"], ["FEEBLE", "Weak"], ["GENUINE", "Authentic"], ["HOSTILE", "Unfriendly"],
  ["IMMENSE", "Huge"], ["JOVIAL", "Cheerful"], ["KEEN", "Eager"], ["METICULOUS", "Careful"],
  ["NOVICE", "Beginner"], ["OBSTINATE", "Stubborn"], ["PRUDENT", "Wise"], ["QUERY", "Question"],
  ["RELUCTANT", "Unwilling"], ["SCARCE", "Rare"], ["TRANQUIL", "Calm"], ["VALIANT", "Heroic"],
  ["WEARY", "Tired"], ["ZEAL", "Enthusiasm"], ["AFFLUENT", "Wealthy"], ["BARREN", "Infertile"],
  ["CONCEAL", "Hide"], ["DEPLETE", "Exhaust"], ["ELOQUENT", "Articulate"], ["FRUGAL", "Thrifty"],
  ["GRATITUDE", "Thankfulness"], ["HAUGHTY", "Proud"], ["INEVITABLE", "Unavoidable"], ["LUCID", "Clear"],
  ["OBSOLETE", "Outdated"], ["PERIL", "Danger"], ["VIGILANT", "Watchful"], ["AMIABLE", "Friendly"],
];
const ANTONYMS: [string, string][] = [
  ["ARROGANT", "Humble"], ["BOLD", "Timid"], ["CAPTURE", "Release"], ["DEFEAT", "Victory"],
  ["EXPAND", "Contract"], ["FAMOUS", "Unknown"], ["GENEROUS", "Stingy"], ["HARMONY", "Discord"],
  ["IGNORANT", "Knowledgeable"], ["JUNIOR", "Senior"], ["KIND", "Cruel"], ["LIBERTY", "Slavery"],
  ["MAXIMUM", "Minimum"], ["NARROW", "Wide"], ["OPTIMIST", "Pessimist"], ["PERMANENT", "Temporary"],
  ["QUIET", "Noisy"], ["RIGID", "Flexible"], ["SHALLOW", "Deep"], ["TRANSPARENT", "Opaque"],
  ["URBAN", "Rural"], ["VACANT", "Occupied"], ["WISDOM", "Folly"], ["EXPORT", "Import"],
  ["ASCEND", "Descend"], ["ACCEPT", "Reject"], ["ARTIFICIAL", "Natural"], ["COWARD", "Hero"],
  ["DIFFICULT", "Easy"], ["ENTRANCE", "Exit"], ["GUILTY", "Innocent"], ["HUMID", "Dry"],
];

const ONE_WORD: [string, string][] = [
  ["A person who loves books", "Bibliophile"], ["A place where bees are kept", "Apiary"],
  ["One who does not eat meat", "Vegetarian"], ["A speech delivered without preparation", "Extempore"],
  ["One who walks in sleep", "Somnambulist"], ["A person who cannot read or write", "Illiterate"],
  ["Fear of water", "Hydrophobia"], ["A doctor who treats children", "Paediatrician"],
  ["The study of birds", "Ornithology"], ["One who believes that everything is decided by fate", "Fatalist"],
  ["Government by the people", "Democracy"], ["That which cannot be seen", "Invisible"],
  ["One who hates mankind", "Misanthrope"], ["The murder of a king", "Regicide"],
  ["The life history of a person written by himself", "Autobiography"], ["A cupboard where clothes are kept", "Wardrobe"],
  ["Animals that feed on plants", "Herbivores"], ["A sound that cannot be heard", "Inaudible"],
  ["One who knows everything", "Omniscient"], ["A substance that kills germs", "Antiseptic"],
  ["A home for children without parents", "Orphanage"], ["One who travels on foot", "Pedestrian"],
  ["Words written on a tomb", "Epitaph"], ["Fit to be eaten", "Edible"],
  ["A collection of poems", "Anthology"], ["One who is present everywhere", "Omnipresent"],
  ["One who offers to work without pay", "Volunteer"], ["A word that means the opposite of another", "Antonym"],
];

const IDIOMS: [string, string][] = [
  ["Break the ice", "Start a conversation"], ["Bite the bullet", "Face a difficult situation bravely"],
  ["Once in a blue moon", "Very rarely"], ["Hit the nail on the head", "Say exactly the right thing"],
  ["Spill the beans", "Reveal a secret"], ["Under the weather", "Feeling unwell"],
  ["Burn the midnight oil", "Work late into the night"], ["Cry over spilt milk", "Regret what cannot be undone"],
  ["A blessing in disguise", "Something good that first seemed bad"], ["Cost an arm and a leg", "Be very expensive"],
  ["Beat around the bush", "Avoid the main point"], ["Call it a day", "Stop working"],
  ["Get cold feet", "Become nervous before an event"], ["In hot water", "In trouble"],
  ["Add fuel to the fire", "Make a bad situation worse"], ["Back to square one", "Start again from the beginning"],
  ["By hook or by crook", "By any means"], ["A storm in a teacup", "A big fuss over something small"],
  ["Turn a deaf ear", "Ignore a request"], ["Apple of one's eye", "Someone very dear"],
  ["At the eleventh hour", "At the last moment"], ["Hand in glove", "Closely associated"],
  ["Red-letter day", "A memorable day"], ["Bury the hatchet", "Make peace"],
];

const SPELLINGS = [
  "Necessary", "Embarrass", "Occurrence", "Separate", "Definitely", "Committee", "Conscience",
  "Millennium", "Rhythm", "Beginning", "Believe", "Receive", "Recommend", "Restaurant", "Tomorrow",
  "Achieve", "Guarantee", "Maintenance", "Parliament", "Pronunciation", "Questionnaire", "Entrepreneur",
  "Privilege", "Acquaintance", "Bureaucracy", "Colleague", "Exaggerate", "Harass", "Independent", "Mischievous",
];

/** Plausible misspellings: a doubled letter dropped or added, ie/ei swapped, a vowel changed. */
function misspellings(word: string): string[] {
  const out = new Set<string>();
  const w = word.toLowerCase();
  for (let i = 1; i < w.length; i++) {
    if (w[i] === w[i - 1]) out.add(w.slice(0, i) + w.slice(i + 1));
    else if (!"aeiou".includes(w[i]) && i < w.length - 1) out.add(w.slice(0, i) + w[i] + w.slice(i));
  }
  if (w.includes("ie")) out.add(w.replace("ie", "ei"));
  if (w.includes("ei")) out.add(w.replace("ei", "ie"));
  const swap: Record<string, string> = { a: "e", e: "a", i: "e", o: "a", u: "o" };
  for (let i = 1; i < w.length; i++) if (swap[w[i]]) out.add(w.slice(0, i) + swap[w[i]] + w.slice(i + 1));
  out.delete(w);
  return [...out].map((s) => s[0].toUpperCase() + s.slice(1));
}

const BLANKS: [string, string, string[]][] = [
  ["He is good ______ mathematics.", "at", ["in", "on", "with"]],
  ["She is afraid ______ dogs.", "of", ["from", "with", "by"]],
  ["She is fond ______ music.", "of", ["for", "with", "in"]],
  ["He was accused ______ theft.", "of", ["for", "with", "about"]],
  ["She insisted ______ paying the bill.", "on", ["in", "for", "at"]],
  ["I prefer tea ______ coffee.", "to", ["than", "from", "with"]],
  ["Neither of the boys ______ present.", "was", ["were", "are", "have"]],
  ["If I ______ a bird, I would fly.", "were", ["am", "is", "be"]],
  ["She ______ here since morning.", "has been", ["is", "was", "be"]],
  ["He ______ to school every day.", "goes", ["go", "going", "gone"]],
  ["The sun ______ in the east.", "rises", ["rise", "rose", "risen"]],
  ["Each of the students ______ a book.", "has", ["have", "are having", "were having"]],
  ["He is senior ______ me.", "to", ["than", "from", "over"]],
  ["She is married ______ a doctor.", "to", ["with", "by", "from"]],
  ["I have lived here ______ ten years.", "for", ["since", "from", "by"]],
  ["He divided the cake ______ the two children.", "between", ["among", "with", "along"]],
  ["The meeting was called ______ because of the rain.", "off", ["of", "up", "out"]],
  ["By next year, she ______ her degree.", "will have completed", ["completes", "completed", "is completing"]],
];

// [parts, index of the part with the error; 3 means "No error"]
const ERRORS: [[string, string, string], number][] = [
  [["She don't", "know the answer", "to this question."], 0],
  [["Each of the boys", "have done", "the homework."], 1],
  [["He is one of the", "best player", "in the team."], 1],
  [["The news", "are", "very good today."], 1],
  [["I have seen him", "yesterday", "at the market."], 0],
  [["Neither Ravi nor", "his friends", "was present."], 2],
  [["She is", "more taller", "than her sister."], 1],
  [["The furniture", "were", "very expensive."], 1],
  [["He has been", "working here", "since five years."], 2],
  [["I look forward", "to meet", "you soon."], 1],
  [["The police has", "arrested", "the thief."], 0],
  [["We discussed", "about the plan", "for an hour."], 1],
  [["He gave me", "an useful", "piece of advice."], 1],
  [["She has", "finished", "her work."], 3],
  [["They will", "arrive", "tomorrow morning."], 3],
  [["The children", "are playing", "in the park."], 3],
];

// [subject, subject as it follows "by", past, past participle, object, plural object]
const PASSIVES: [string, string, string, string, string, boolean][] = [
  ["Ravi", "Ravi", "wrote", "written", "a letter", false],
  ["The police", "the police", "caught", "caught", "the thief", false],
  ["She", "her", "sang", "sung", "a song", false],
  ["The chef", "the chef", "cooked", "cooked", "the meal", false],
  ["The boy", "the boy", "broke", "broken", "the window", false],
  ["My mother", "my mother", "made", "made", "a cake", false],
  ["The teacher", "the teacher", "praised", "praised", "the students", true],
  ["They", "them", "built", "built", "a house", false],
  ["The wind", "the wind", "blew", "blown", "the leaves", true],
  ["He", "him", "painted", "painted", "the walls", true],
  ["The farmer", "the farmer", "grew", "grown", "vegetables", true],
  ["We", "us", "won", "won", "the match", false],
];

// [speaker, pronoun, direct speech, reported (shifted), reported (unshifted)]
const NARRATIONS: [string, string, string, string, string][] = [
  ["She", "she", "I am happy.", "was happy", "is happy"],
  ["He", "he", "I like mangoes.", "liked mangoes", "likes mangoes"],
  ["Ravi", "he", "I am busy.", "was busy", "is busy"],
  ["Priya", "she", "I live in Delhi.", "lived in Delhi", "lives in Delhi"],
  ["He", "he", "I can swim.", "could swim", "can swim"],
  ["She", "she", "I will come tomorrow.", "would come the next day", "will come tomorrow"],
  ["He", "he", "I have finished my work.", "had finished his work", "has finished his work"],
  ["Meena", "she", "I am reading a book.", "was reading a book", "is reading a book"],
  ["Amit", "he", "I play cricket.", "played cricket", "plays cricket"],
  ["She", "she", "I know the answer.", "knew the answer", "knows the answer"],
];

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

export function englishFamilies(): Draft[][] {
  const synAnswers = SYNONYMS.map(([, s]) => s);
  const antAnswers = ANTONYMS.map(([, a]) => a);
  return [
    SYNONYMS.map(([w, s]) => {
      const { options, correct } = mcq(s, antAnswers);
      return { topic: SYN_ANT, difficulty: pick(["EASY", "MEDIUM"] as const), text: p(`Choose the synonym of <strong>${w}</strong>.`), options, correct };
    }),
    ANTONYMS.map(([w, a]) => {
      const { options, correct } = mcq(a, synAnswers);
      return { topic: SYN_ANT, difficulty: pick(["EASY", "MEDIUM"] as const), text: p(`Choose the antonym of <strong>${w}</strong>.`), options, correct };
    }),
    family(ONE_WORD, "One Word Substitution", "MEDIUM", ([d]) => `${d}.`, ([, w]) => w),
    family(IDIOMS, "Idioms & Phrases", "MEDIUM", ([i]) => `What does the idiom <em>${i.toLowerCase()}</em> mean?`, ([, m]) => m),
    SPELLINGS.map((w) => {
      const { options, correct } = mcq(w, misspellings(w));
      return { topic: "Spelling Correction", difficulty: "MEDIUM" as const, text: p("Choose the correctly spelt word."), options, correct };
    }),
    BLANKS.map(([s, right, wrong]) => {
      const { options, correct } = mcq(right, wrong);
      return { topic: "Fill in the Blanks", difficulty: "EASY" as const, text: p(s), options, correct };
    }),
    ERRORS.map(([parts, i]) => ({
      topic: "Spotting Errors", difficulty: "MEDIUM" as const,
      text: p(`Find the part of the sentence with an error: <em>${parts.join(" / ")}</em>`),
      options: [...parts, "No error"] as Four, correct: (["A", "B", "C", "D"] as const)[i],
    })),
    PASSIVES.map(([subj, by, past, pp, obj, plural]) => {
      const o = cap(obj);
      const { options, correct } = mcq(`${o} ${plural ? "were" : "was"} ${pp} by ${by}.`, [
        `${o} ${plural ? "are" : "is"} ${pp} by ${by}.`,
        `${o} ${plural ? "have" : "has"} been ${pp} by ${by}.`,
        `${subj} was ${pp} by ${obj}.`,
      ]);
      return { topic: "Active & Passive Voice", difficulty: "MEDIUM" as const, text: p(`Change to passive voice: <em>${subj} ${past} ${obj}.</em>`), options, correct };
    }),
    NARRATIONS.map(([speaker, pr, direct, shifted, unshifted]) => {
      const { options, correct } = mcq(`${speaker} said that ${pr} ${shifted}.`, [
        `${speaker} said that ${pr} ${unshifted}.`,
        `${speaker} said that I ${shifted}.`,
        `${speaker} told that ${pr} ${unshifted}.`,
      ]);
      return { topic: "Direct & Indirect Speech", difficulty: "MEDIUM" as const, text: p(`Change to indirect speech: <em>${speaker} said, "${direct}"</em>`), options, correct };
    }),
  ].map((f) => shuffle(f));
}
