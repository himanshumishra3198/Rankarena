// CAT Verbal Ability & Reading Comprehension: hand-written, since none of it
// can be computed. Reading passages carry four questions each; para jumbles
// and odd-sentence-out are type-in, as on the real paper, with the sentences
// shuffled here so the answer key is derived rather than typed by hand.
import { mcq, p, paras, shuffle, type CatDraft, type CatSet } from "./lib";

function rcQuestion(text: string, right: string, wrong: string[], skill?: string): CatDraft {
  const { options, correct } = mcq(right, wrong);
  return { type: "PASSAGE", topic: "Reading Comprehension", skill, difficulty: "MEDIUM", text: p(text), options, correct };
}

export function catRcSets(): CatSet[] {
  return [
    {
      passage: {
        title: "Trees and the urban heat island",
        type: "TEXT",
        tableData: null,
        content: paras(
          "Cities are, on average, several degrees warmer than the countryside around them, an effect planners call the urban heat island. Asphalt and concrete absorb sunlight during the day and release it slowly through the night, so that a city street may still be radiating the afternoon's heat long after midnight. For residents without air conditioning — typically the poorest — this is not a matter of comfort. Heatwaves kill more people in many countries than floods or storms, and they kill disproportionately in cities.",
          "Trees are the most studied remedy. A mature tree cools in two ways: its canopy shades the ground beneath it, and its leaves release water vapour, which draws heat from the surrounding air. Measurements in several cities have found shaded pavements to be more than ten degrees cooler than exposed ones on a summer afternoon. Yet planting programmes often disappoint. Saplings are placed where space is easiest to find rather than where heat is worst, and many die within a few years for want of water and care.",
          "The lesson, researchers argue, is that a tree is not a piece of street furniture to be installed and forgotten. It is a long-term investment whose returns arrive only after a decade or more — which is precisely the horizon that municipal budgets, renewed every year, are worst at planning for.",
        ),
      },
      questions: [
        rcQuestion("Which of the following best describes the main concern of the passage?",
          "Why tree planting, though an effective remedy for urban heat, often fails to deliver its benefits",
          ["How asphalt and concrete make cities warmer than the countryside", "Why heatwaves are more dangerous than floods and storms", "How municipal budgets should be restructured to pay for air conditioning"]),
        rcQuestion("According to the passage, a mature tree cools its surroundings by:",
          "shading the ground and releasing water vapour from its leaves",
          ["absorbing sunlight during the day and releasing it at night", "reflecting sunlight away from pavements and walls", "lowering the humidity of the surrounding air"]),
        rcQuestion("The author mentions that heatwaves \"kill disproportionately in cities\" in order to:",
          "show that urban heat is a matter of public health and not only of comfort",
          ["argue that cities should be designed more like the countryside", "suggest that floods and storms are less serious than is commonly believed", "explain why the poorest residents cannot afford air conditioning"], "Inference"),
        rcQuestion("Which of the following, if true, would most weaken the researchers' argument in the final paragraph?",
          "Cities that budget for tree care one year at a time keep their saplings alive as often as cities that plan over decades.",
          ["Saplings planted in the hottest neighbourhoods need more water than those planted elsewhere.", "Shaded pavements cool down more quickly after sunset than exposed ones.", "Many residents would prefer more trees to more street furniture."], "Inference"),
      ],
    },
    {
      passage: {
        title: "Railway time",
        type: "TEXT",
        tableData: null,
        content: paras(
          "Until the middle of the nineteenth century, every town kept its own time. Noon was the moment the sun stood highest over the town hall, and since the sun crosses the sky from east to west, noon in a town a hundred kilometres to the east arrived several minutes earlier. Nobody minded, because nobody could travel fast enough to notice.",
          "The railways changed that. A timetable that listed departures in the local time of each station was a puzzle for passengers and a danger for the companies, which ran trains in both directions on a single line and needed to know exactly when each would pass. Their solution was to run every clock on the network to a single time, usually that of the capital. For a while many towns displayed two times on their clocks — the local one and the railway's — before the convenience of the second made the first redundant.",
          "It is tempting to tell this as a story of progress, of science replacing superstition. But local time was not superstitious: it was perfectly accurate to the sun. What standard time offered was not truth but coordination, and it was adopted not because it was right but because it was shared.",
        ),
      },
      questions: [
        rcQuestion("The central idea of the passage is that:",
          "standard time was adopted because it allowed coordination, not because it was more accurate",
          ["the railways drove most of the scientific progress of the nineteenth century", "local time was an unscientific practice that standard time eventually corrected", "towns resisted standard time for decades because they preferred their own clocks"]),
        rcQuestion("Why, according to the passage, did nobody mind that different towns kept different times?",
          "Travel was too slow for the difference to be noticed.",
          ["Every town hall displayed both the local time and the capital's.", "The differences between neighbouring towns were too small to measure.", "Most people did not own clocks or watches."]),
        rcQuestion("The word \"redundant\" in the second paragraph is closest in meaning to:",
          "no longer needed", ["inaccurate", "illegal", "repeated"]),
        rcQuestion("Which of the following can be inferred from the passage?",
          "Under local time, a town to the west of the capital reached noon later than the capital did.",
          ["Railway companies were the first organisations to use clocks.", "Single-line railways were safer before timetables were introduced.", "Towns that showed two times on their clocks eventually returned to local time."], "Inference"),
      ],
    },
    {
      passage: {
        title: "Notes by hand",
        type: "TEXT",
        tableData: null,
        content: paras(
          "Students who take notes on laptops write down far more of a lecture than students who write by hand. For a long time this was assumed to be an advantage: more notes, surely, meant more material to revise from. A series of experiments has complicated that view. When students were tested on what they had heard, those who had written by hand did at least as well on factual questions and noticeably better on conceptual ones.",
          "The explanation the researchers offer turns on speed. Most people type fast enough to transcribe a lecture almost word for word, and so they do — without having to decide what matters. Writing by hand is too slow for that. A student with a pen must listen, select and rephrase, and it is this processing, rather than the record it produces, that seems to fix the material in memory.",
          "None of this makes the laptop the villain. Students told explicitly not to transcribe still tended to do so, which suggests the habit, not the machine, is the problem. A tool that makes copying effortless simply removes a difficulty that, it turns out, was doing useful work.",
        ),
      },
      questions: [
        rcQuestion("Which of the following best captures the argument of the passage?",
          "The effort that slow note-taking demands helps students understand and remember what they hear.",
          ["Laptops should be banned from lecture halls because they distract students.", "Students who take more notes do better in tests because they have more to revise from.", "Handwritten notes are more accurate records of a lecture than typed ones."]),
        rcQuestion("According to the passage, students who wrote their notes by hand:",
          "did better than laptop users on conceptual questions",
          ["wrote down more of the lecture than laptop users", "did worse than laptop users on factual questions", "had been told not to transcribe the lecture"]),
        rcQuestion("The author's attitude towards laptops in the final paragraph is best described as:",
          "measured — the tool is not to blame, but the ease it brings has a cost",
          ["hostile — laptops are the main cause of poor learning", "enthusiastic — laptops let students record more", "indifferent — the choice of tool makes no difference"], "Inference"),
        rcQuestion("Which of the following, if true, would most strengthen the researchers' explanation?",
          "Laptop users made to summarise as they typed did as well as students writing by hand.",
          ["Students who wrote by hand said they enjoyed the lectures more.", "Typed notes are easier to search and share than handwritten ones.", "Students who typed their notes spent longer revising them before the test."], "Inference"),
      ],
    },
  ];
}

// ── Para jumbles ────────────────────────────────────────────────────────────

/** Each paragraph is in its correct order; the question shuffles it. */
const JUMBLES: string[][] = [
  [
    "Coffee was first cultivated on the hillsides of Yemen, where Sufi monks drank it to stay awake through night-long prayers.",
    "From the port of Mocha it travelled to Cairo, Istanbul and Damascus, and coffee houses soon became the places where news was shared and argued over.",
    "Those same coffee houses alarmed the authorities, who more than once tried to close them as breeding grounds of sedition.",
    "The bans never lasted long: the drink, and the conversation that came with it, had become too popular to suppress.",
  ],
  [
    "For centuries, a lighthouse keeper's main task was simply to keep the lamp burning through the night.",
    "That meant trimming the wick, polishing the lens and winding the clockwork that turned it, often every few hours until dawn.",
    "Electrification and, later, automation made most of this work unnecessary.",
    "Today almost every lighthouse runs unattended, and the keeper's cottage, where there is one, is more often a holiday let.",
  ],
  [
    "Some species of bamboo flower only once every few decades.",
    "When they do, every plant of the species flowers at the same time, across whole regions, and then dies.",
    "The sudden glut of seed feeds an explosion in the rat population.",
    "Once the seed is gone, the rats turn to stored grain, and the famines that follow have been recorded in north-east India for centuries.",
  ],
  [
    "For years, users were told to make passwords long, complicated and different for every account.",
    "The result was predictable: people who could not remember dozens of complicated strings wrote them down or reused the same one everywhere.",
    "Security experts eventually concluded that the advice had made accounts less safe, not more.",
    "Current guidance has accordingly shifted towards password managers, which remember the strings so that people do not have to.",
  ],
  [
    "Before printing, English spelling varied from writer to writer and even from page to page.",
    "Early printers, many of them trained abroad, set words in whatever form suited them, sometimes adding letters simply to fill out a line.",
    "As printed books multiplied, these choices were copied from one edition to the next until they hardened into a standard.",
    "That is one reason English spelling so often fails to match pronunciation: it records the habits of fifteenth-century workshops.",
  ],
  [
    "Every autumn, the bar-tailed godwit leaves Alaska and flies south over the Pacific.",
    "It does not stop: the journey to New Zealand, more than eleven thousand kilometres, is made in a single flight of about nine days.",
    "To survive it, the bird first nearly doubles its body weight, storing fat as fuel.",
    "It then shrinks the organs it will not need in the air, such as its gut, so that the extra weight is carried as efficiently as possible.",
  ],
  [
    "Open-plan offices were promoted as a way to bring colleagues together.",
    "Without walls, the argument went, people would talk more, share ideas and solve problems faster.",
    "When researchers actually measured behaviour, they found the reverse: face-to-face conversation fell sharply after the walls came down.",
    "Employees, it seems, responded to being constantly overheard by retreating into headphones and email.",
  ],
];

export function catParaJumbles(): CatDraft[] {
  return JUMBLES.map((sentences) => {
    const idx = sentences.map((_, i) => i);
    let shown = idx;
    while (shown.every((s, i) => s === i)) shown = shuffle(idx);
    // The key is the label each sentence was shown under, read in the
    // paragraph's true order.
    const answer = idx.map((s) => shown.indexOf(s) + 1).join("");
    return {
      type: "TITA", topic: "Para Jumbles", difficulty: "MEDIUM",
      text:
        p("The four sentences (labelled 1, 2, 3 and 4) given below, when properly sequenced, form a coherent paragraph. Decide on the proper order and key in the sequence of the four numbers as your answer.") +
        shown.map((s, i) => p(`${i + 1}. ${sentences[s]}`)).join(""),
      tita: { kind: "NUMERIC", accepted: [answer] },
      solution: p(`The paragraph reads ${answer.split("").join(" → ")}.`),
    };
  });
}

// ── Odd sentence out ────────────────────────────────────────────────────────

/** Four sentences that belong together, then the one that does not. */
const ODD_ONES: { fits: string[]; odd: string }[] = [
  {
    fits: [
      "A honeybee that has found a good source of nectar returns to the hive and performs a dance.",
      "The angle of the dance tells the other bees the direction of the flowers relative to the sun.",
      "The length of its waggling run tells them how far away the flowers are.",
      "Bees that follow the dancer closely then leave the hive and fly straight to the source.",
    ],
    odd: "Honey has been found in Egyptian tombs, still edible after thousands of years.",
  },
  {
    fits: [
      "Stepwells were built across western India to reach groundwater that lay far below the surface.",
      "Flights of steps descended to the water, so that it could be reached whatever its level through the year.",
      "Because their lower galleries stayed cool, the wells also served as gathering places in the hot months.",
      "Many were richly carved, reflecting the status of the patrons who paid for them.",
    ],
    odd: "Modern borewells can draw water from depths of several hundred metres.",
  },
  {
    fits: [
      "When enough people in a population are immune to a disease, it struggles to spread.",
      "Each infected person then passes it on, on average, to fewer than one other person, and outbreaks die out.",
      "This protects those who cannot be vaccinated, such as newborn babies.",
      "How large a share of the population must be immune depends on how contagious the disease is.",
    ],
    odd: "Edward Jenner tested his smallpox vaccine on the son of his gardener.",
  },
  {
    fits: [
      "Sunlight does not reach the ocean below about a thousand metres.",
      "Without it no plants can grow there, and animals must depend on food that drifts down from above.",
      "This steady fall of dead matter is known as marine snow.",
      "Many deep-sea creatures have slow metabolisms that let them survive long gaps between meals.",
    ],
    odd: "Coral reefs, which grow in shallow sunlit water, support about a quarter of all marine species.",
  },
];

export function catOddOneOut(): CatDraft[] {
  return ODD_ONES.map(({ fits, odd }) => {
    const shown = shuffle([...fits, odd]);
    const answer = shown.indexOf(odd) + 1;
    return {
      type: "TITA", topic: "Odd Sentence Out", skill: "Elimination", difficulty: "MEDIUM",
      text:
        p("Five jumbled sentences (labelled 1 to 5), related to a topic, are given below. Four of them can be put together to form a coherent paragraph. Identify the odd one out and key in its number as your answer.") +
        shown.map((s, i) => p(`${i + 1}. ${s}`)).join(""),
      tita: { kind: "NUMERIC", accepted: [String(answer)] },
      solution: p(`Sentence ${answer} does not belong: "${odd}" The other four form one paragraph.`),
    };
  });
}

// ── Para summary ────────────────────────────────────────────────────────────

const SUMMARIES: { passage: string; right: string; wrong: string[] }[] = [
  {
    passage: "Many people assume that a language with no word for a colour must leave its speakers unable to see it. Experiments suggest otherwise. Speakers of languages that use one word for both blue and green can still tell the two apart when shown them side by side; what differs is how quickly they do it, and how easily they remember which shade they saw. Language, in other words, does not set the limits of perception, but it does shape how readily we sort and recall what we perceive.",
    right: "Language does not limit what we can perceive, but it influences how quickly we categorise and remember it.",
    wrong: ["People whose language has no word for a colour cannot see that colour.", "Blue and green are perceived identically by speakers of every language.", "Memory for colours depends entirely on how many colour words a language has."],
  },
  {
    passage: "When a city adds a lane to a congested road, traffic usually flows freely for a while. Then the new capacity attracts drivers who previously took other routes, travelled at other times or did not make the trip at all. Within a few years the road is as congested as before, only now with more cars on it. Transport planners call this induced demand, and it is why building roads is rarely a lasting cure for congestion.",
    right: "Widening roads tends to attract extra traffic, so it seldom relieves congestion for long.",
    wrong: ["Drivers should be encouraged to travel at different times to reduce congestion.", "New lanes permanently reduce congestion by giving drivers more space.", "Transport planners have failed to understand why cities become congested."],
  },
  {
    passage: "A museum that displays an object takes it out of the life it once had. A ceremonial mask that was worn, danced in and eventually allowed to decay becomes, behind glass, a thing to be looked at and preserved for ever. Curators increasingly acknowledge this, and some now work with the communities the objects came from — lending items back for ceremonies, or letting them age as they were meant to. The question is no longer only how to keep an object, but what keeping it means.",
    right: "Preserving an object in a museum changes its meaning, and curators are now rethinking what it means to keep one.",
    wrong: ["Museums should return every ceremonial object to the community it came from.", "Ceremonial masks decay quickly unless they are displayed behind glass.", "Curators have always worked closely with the communities whose objects they hold."],
  },
  {
    passage: "It is often said that people resist change. Studies of organisations suggest a more precise version: people resist losses. A change that is presented as taking away something familiar — a routine, a role, a sense of competence — meets far more opposition than the same change presented in terms of what it adds. Much resistance, on this view, is not to the change itself but to the way it is framed.",
    right: "Resistance to change is largely resistance to perceived loss, and so depends on how the change is presented.",
    wrong: ["People resist every kind of change, whatever it involves.", "Organisations should avoid changes that affect employees' routines.", "A change succeeds only when it adds something without taking anything away."],
  },
];

export function catParaSummaries(): CatDraft[] {
  return SUMMARIES.map(({ passage, right, wrong }) => {
    const { options, correct } = mcq(right, wrong);
    return {
      type: "STANDARD", topic: "Para Summary", difficulty: "MEDIUM",
      text: p("The passage given below is followed by four summaries. Choose the option that best captures the author's position.") + p(passage),
      options, correct,
    };
  });
}
