// Hand-written questions: the edge cases the generators do not produce —
// passages and data tables, syllogisms with translations, a deliberately
// mis-keyed question, and questions reserved for the live and upcoming
// contests and the unpublished mock.
import { p, type Four, type SeedQuestion } from "./lib";

const SYLLOGISM_OPTIONS: Four = [
  "Only conclusion I follows",
  "Only conclusion II follows",
  "Both I and II follow",
  "Neither I nor II follows",
];
const SYLLOGISM_OPTIONS_HI: Four = [
  "केवल निष्कर्ष I अनुसरण करता है",
  "केवल निष्कर्ष II अनुसरण करता है",
  "I और II दोनों अनुसरण करते हैं",
  "न तो I और न ही II अनुसरण करता है",
];

export const FIXED_QUESTIONS: SeedQuestion[] = [
  // ── QUANT ──
  {
    key: "q-pct-20-of-150", subject: "QUANT", topic: "Percentage", difficulty: "EASY",
    text: p("What is 20% of 150?"), options: ["25", "30", "35", "40"], correct: "B",
    solution: p("20% of 150 = 150 × 20/100 = 30."),
    hi: { text: p("150 का 20% कितना है?"), options: ["25", "30", "35", "40"], solution: p("150 × 20/100 = 30") },
  },
  {
    // Deliberately mis-keyed: 25% of 80 is 20 (B), but the key says C. Most
    // seeded students answer B, which is the signature issue #7 looks for.
    key: "q-pct-25-of-80-miskeyed", subject: "QUANT", topic: "Percentage", difficulty: "EASY",
    text: p("What is 25% of 80?"), options: ["16", "20", "25", "32"], correct: "C",
    solution: p("25% of 80 = 80 × 25/100 = 20."),
    hi: { text: p("80 का 25% कितना है?"), options: ["16", "20", "25", "32"] },
  },
  {
    key: "q-pct-up-down", subject: "QUANT", topic: "Percentage", difficulty: "MEDIUM",
    text: p("A number is first increased by 20% and then decreased by 20%. What is the net change?"),
    options: ["No change", "4% increase", "4% decrease", "2% decrease"], correct: "C",
    solution: p("Net change = 20 − 20 − (20 × 20)/100 = −4%, i.e. a 4% decrease."),
    hi: {
      text: p("किसी संख्या में पहले 20% की वृद्धि और फिर 20% की कमी की जाती है। कुल परिवर्तन क्या है?"),
      options: ["कोई परिवर्तन नहीं", "4% वृद्धि", "4% कमी", "2% कमी"],
    },
  },
  {
    key: "q-pct-40-is-72", subject: "QUANT", topic: "Percentage", difficulty: "EASY",
    text: p("If 40% of a number is 72, what is the number?"), options: ["160", "170", "180", "190"], correct: "C",
    solution: p("Number = 72 × 100/40 = 180."),
    hi: { text: p("यदि किसी संख्या का 40%, 72 है, तो वह संख्या क्या है?"), options: ["160", "170", "180", "190"] },
  },
  {
    key: "q-si-5000", subject: "QUANT", topic: "Simple & Compound Interest", difficulty: "EASY",
    text: p("Find the simple interest on ₹5,000 at 8% per annum for 3 years."),
    options: ["₹1,000", "₹1,200", "₹1,250", "₹1,500"], correct: "B",
    solution: p("SI = P × R × T / 100 = 5000 × 8 × 3 / 100 = ₹1,200."),
    hi: { text: p("₹5,000 पर 8% वार्षिक दर से 3 वर्ष का साधारण ब्याज ज्ञात कीजिए।"), options: ["₹1,000", "₹1,200", "₹1,250", "₹1,500"] },
  },
  {
    key: "q-ci-10000", subject: "QUANT", topic: "Simple & Compound Interest", difficulty: "MEDIUM",
    text: p("Find the compound interest on ₹10,000 at 10% per annum for 2 years, compounded annually."),
    options: ["₹2,000", "₹2,100", "₹2,200", "₹2,010"], correct: "B",
    solution: p("Amount = 10000 × (1.1)² = ₹12,100, so CI = ₹2,100."),
    hi: { text: p("₹10,000 पर 10% वार्षिक दर से 2 वर्ष का चक्रवृद्धि ब्याज (वार्षिक संयोजित) ज्ञात कीजिए।"), options: ["₹2,000", "₹2,100", "₹2,200", "₹2,010"] },
  },
  {
    key: "q-si-2000", subject: "QUANT", topic: "Simple & Compound Interest", difficulty: "EASY",
    text: p("Find the simple interest on ₹2,000 at 5% per annum for 4 years."),
    options: ["₹300", "₹350", "₹400", "₹450"], correct: "C",
  },
  {
    key: "q-profit-400", subject: "QUANT", topic: "Profit, Loss & Discount", difficulty: "EASY",
    text: p("An article bought for ₹400 is sold for ₹500. What is the profit percentage?"),
    options: ["20%", "25%", "30%", "100%"], correct: "B",
    solution: p("Profit = 100 on a cost of 400, so 100/400 × 100 = 25%."),
    hi: { text: p("₹400 में खरीदी गई वस्तु ₹500 में बेची जाती है। लाभ प्रतिशत क्या है?"), options: ["20%", "25%", "30%", "100%"] },
  },
  {
    key: "q-train-pole", subject: "QUANT", topic: "Time, Speed & Distance", difficulty: "MEDIUM",
    text: p("A train 150 m long passes a pole in 15 seconds. What is its speed in km/h?"),
    options: ["30", "36", "40", "45"], correct: "B",
    solution: p("Speed = 150/15 = 10 m/s = 10 × 18/5 = 36 km/h."),
  },
  {
    key: "q-work-a-b", subject: "QUANT", topic: "Time & Work, Pipes & Cisterns", difficulty: "MEDIUM",
    text: p("A can finish a piece of work in 10 days and B in 15 days. In how many days can they finish it together?"),
    options: ["5", "6", "8", "12"], correct: "B",
    solution: p("Together they do 1/10 + 1/15 = 1/6 of the work per day, so 6 days."),
    hi: { text: p("A किसी काम को 10 दिन में और B 15 दिन में पूरा कर सकता है। दोनों मिलकर उसे कितने दिनों में पूरा करेंगे?"), options: ["5", "6", "8", "12"] },
  },
  {
    key: "q-ratio-1200", subject: "QUANT", topic: "Ratio, Proportion & Partnership", difficulty: "EASY",
    text: p("₹1,200 is divided in the ratio 3 : 5. What is the larger share?"),
    options: ["₹450", "₹600", "₹720", "₹750"], correct: "D",
  },
  {
    key: "q-avg-10", subject: "QUANT", topic: "Average & Mixture", difficulty: "EASY",
    text: p("What is the average of the first 10 natural numbers?"), options: ["5", "5.5", "6", "10"], correct: "B",
  },
  {
    key: "q-lcm-untagged", subject: "QUANT", topic: null, difficulty: "EASY",
    text: p("What is the LCM of 12 and 18?"), options: ["6", "24", "36", "72"], correct: "C",
  },
  {
    key: "q-algebra-x1x", subject: "QUANT", topic: "Algebra", difficulty: "HARD",
    text: p("If x + 1/x = 3, what is the value of x<sup>2</sup> + 1/x<sup>2</sup>?"), options: ["7", "9", "11", "5"], correct: "A",
    solution: p("Square both sides: x² + 2 + 1/x² = 9, so x² + 1/x² = 7."),
  },
  {
    key: "q-circle-area", subject: "QUANT", topic: "Geometry & Mensuration", difficulty: "EASY",
    text: p("What is the area of a circle of radius 7 cm? (Take π = 22/7)"),
    options: ["44 cm²", "144 cm²", "154 cm²", "176 cm²"], correct: "C",
  },
  {
    key: "q-di-total-a", subject: "QUANT", topic: "Data Interpretation", difficulty: "MEDIUM", type: "TABLE", passage: "table-sales",
    text: p("What are the total sales of Product A over the four years?"),
    options: ["₹150 lakh", "₹160 lakh", "₹170 lakh", "₹180 lakh"], correct: "C",
  },
  {
    key: "q-di-growth-b", subject: "QUANT", topic: "Data Interpretation", difficulty: "HARD", type: "TABLE", passage: "table-sales",
    text: p("By what percentage did sales of Product B grow from 2021 to 2024?"),
    options: ["50%", "60%", "75%", "100%"], correct: "D",
  },
  // Only in the live / upcoming contests — must never be served by practice.
  // Worded almost like q-pct-20-of-150 on purpose, for testing that a
  // similarity ranker cannot leak it.
  {
    key: "q-pct-30-of-150-live", subject: "QUANT", topic: "Percentage", difficulty: "EASY",
    text: p("What is 30% of 150?"), options: ["35", "40", "45", "50"], correct: "C",
  },
  {
    key: "q-si-8000-live", subject: "QUANT", topic: "Simple & Compound Interest", difficulty: "EASY",
    text: p("Find the simple interest on ₹8,000 at 6% per annum for 2 years."),
    options: ["₹860", "₹960", "₹980", "₹1,060"], correct: "B",
  },
  {
    key: "q-loss-upcoming", subject: "QUANT", topic: "Profit, Loss & Discount", difficulty: "MEDIUM",
    text: p("A shopkeeper sells an item for ₹720 at a loss of 10%. What was its cost price?"),
    options: ["₹780", "₹792", "₹800", "₹810"], correct: "C",
  },

  // ── REASONING ──
  {
    key: "r-series-42", subject: "REASONING", topic: "Series (Number & Alphabet)", difficulty: "EASY",
    text: p("Find the next term: 2, 6, 12, 20, 30, ?"), options: ["38", "40", "42", "44"], correct: "C",
    solution: p("Differences are 4, 6, 8, 10, so the next difference is 12: 30 + 12 = 42."),
    hi: { text: p("अगला पद ज्ञात कीजिए: 2, 6, 12, 20, 30, ?"), options: ["38", "40", "42", "44"] },
  },
  {
    key: "r-series-alpha", subject: "REASONING", topic: "Series (Number & Alphabet)", difficulty: "MEDIUM",
    text: p("Find the next term: A, C, F, J, ?"), options: ["N", "O", "P", "M"], correct: "B",
  },
  {
    key: "r-analogy", subject: "REASONING", topic: "Analogy", difficulty: "EASY",
    text: p("Doctor : Hospital :: Teacher : ?"), options: ["Book", "School", "Student", "Class"], correct: "B",
    hi: { text: p("डॉक्टर : अस्पताल :: शिक्षक : ?"), options: ["किताब", "विद्यालय", "छात्र", "कक्षा"] },
  },
  {
    key: "r-odd", subject: "REASONING", topic: "Classification (Odd One Out)", difficulty: "EASY",
    text: p("Find the odd one out."), options: ["Apple", "Mango", "Potato", "Banana"], correct: "C",
  },
  {
    key: "r-coding", subject: "REASONING", topic: "Coding-Decoding", difficulty: "MEDIUM",
    text: p("If CAT is coded as DBU, how is DOG coded?"), options: ["EPH", "EOH", "DPH", "FQI"], correct: "A",
    solution: p("Each letter is shifted forward by one: D→E, O→P, G→H."),
  },
  {
    key: "r-blood", subject: "REASONING", topic: "Blood Relations", difficulty: "MEDIUM",
    text: p("Pointing to a man, Riya says, \"He is the son of my mother's only brother.\" How is the man related to Riya?"),
    options: ["Brother", "Uncle", "Cousin", "Nephew"], correct: "C",
  },
  {
    key: "r-direction", subject: "REASONING", topic: "Direction & Distance", difficulty: "MEDIUM",
    text: p("Ravi walks 5 km north, turns right and walks 3 km, then turns right and walks 5 km. How far is he from his starting point?"),
    options: ["3 km", "5 km", "8 km", "13 km"], correct: "A",
    hi: {
      text: p("रवि 5 किमी उत्तर चलता है, दाएँ मुड़कर 3 किमी चलता है, फिर दाएँ मुड़कर 5 किमी चलता है। वह अपने आरंभिक बिंदु से कितनी दूर है?"),
      options: ["3 किमी", "5 किमी", "8 किमी", "13 किमी"],
    },
  },
  {
    key: "r-ranking", subject: "REASONING", topic: "Order & Ranking", difficulty: "EASY",
    text: p("Aman is 7th from the left and 12th from the right in a row. How many people are in the row?"),
    options: ["17", "18", "19", "20"], correct: "B",
  },
  {
    key: "r-syllogism-1", subject: "REASONING", topic: "Syllogism & Statement-Conclusion", difficulty: "MEDIUM", type: "SYLLOGISM",
    text: p("Read the statements and decide which conclusion(s) logically follow."),
    structuredData: {
      statements: ["All pens are books.", "All books are bags."],
      conclusions: ["I. All pens are bags.", "II. Some bags are pens."],
    },
    options: SYLLOGISM_OPTIONS, correct: "C",
    hi: {
      text: p("कथनों को पढ़िए और तय कीजिए कि कौन-सा/से निष्कर्ष तार्किक रूप से अनुसरण करता/करते है/हैं।"),
      options: SYLLOGISM_OPTIONS_HI,
      structuredData: {
        statements: ["सभी पेन किताबें हैं।", "सभी किताबें बैग हैं।"],
        conclusions: ["I. सभी पेन बैग हैं।", "II. कुछ बैग पेन हैं।"],
      },
    },
  },
  {
    key: "r-syllogism-2", subject: "REASONING", topic: "Syllogism & Statement-Conclusion", difficulty: "HARD", type: "SYLLOGISM",
    text: p("Read the statements and decide which conclusion(s) logically follow."),
    structuredData: {
      statements: ["Some cats are dogs.", "No dog is a rat."],
      conclusions: ["I. Some cats are not rats.", "II. No cat is a rat."],
    },
    options: SYLLOGISM_OPTIONS, correct: "A",
  },
  {
    key: "r-math-ops", subject: "REASONING", topic: "Mathematical Operations", difficulty: "MEDIUM",
    text: p("If '+' means '×' and '×' means '−', what is the value of 6 + 2 × 3?"), options: ["5", "9", "12", "15"], correct: "B",
  },
  {
    key: "r-series-untagged", subject: "REASONING", topic: null, difficulty: "EASY",
    text: p("Find the missing number: 3, 9, 27, ?, 243"), options: ["54", "72", "81", "90"], correct: "C",
  },
  // Only in the unpublished reasoning mock — must never be served by practice.
  {
    key: "r-draft-analogy", subject: "REASONING", topic: "Analogy", difficulty: "MEDIUM",
    text: p("Bird : Nest :: Bee : ?"), options: ["Hive", "Den", "Burrow", "Stable"], correct: "A",
  },
  {
    key: "r-draft-coding", subject: "REASONING", topic: "Coding-Decoding", difficulty: "MEDIUM",
    text: p("If SUN is coded as TVO, how is MOON coded?"), options: ["NPPO", "NPOP", "LNNM", "NOPP"], correct: "A",
  },
  {
    key: "r-live-ranking", subject: "REASONING", topic: "Order & Ranking", difficulty: "EASY",
    text: p("Neha is 10th from the top and 15th from the bottom in a class. How many students are in the class?"),
    options: ["23", "24", "25", "26"], correct: "B",
  },
  {
    key: "r-upcoming-direction", subject: "REASONING", topic: "Direction & Distance", difficulty: "EASY",
    text: p("Facing east, Sunil turns left, then left again. Which direction is he facing now?"),
    options: ["North", "South", "East", "West"], correct: "D",
  },

  // ── ENGLISH ──
  {
    key: "e-syn-abundant", subject: "ENGLISH", topic: "Synonyms & Antonyms", difficulty: "EASY",
    text: p("Choose the synonym of <strong>ABUNDANT</strong>."), options: ["Scarce", "Plentiful", "Rare", "Empty"], correct: "B",
  },
  {
    key: "e-ant-benevolent", subject: "ENGLISH", topic: "Synonyms & Antonyms", difficulty: "MEDIUM",
    text: p("Choose the antonym of <strong>BENEVOLENT</strong>."), options: ["Kind", "Generous", "Malevolent", "Gentle"], correct: "C",
  },
  {
    key: "e-idiom", subject: "ENGLISH", topic: "Idioms & Phrases", difficulty: "EASY",
    text: p("What does the idiom <em>a piece of cake</em> mean?"), options: ["Something delicious", "Very easy", "A small share", "A celebration"], correct: "B",
  },
  {
    key: "e-ows", subject: "ENGLISH", topic: "One Word Substitution", difficulty: "EASY",
    text: p("One who can speak many languages."), options: ["Linguist", "Polyglot", "Bilingual", "Orator"], correct: "B",
  },
  {
    key: "e-spelling", subject: "ENGLISH", topic: "Spelling Correction", difficulty: "MEDIUM",
    text: p("Choose the correctly spelt word."), options: ["Accomodation", "Acommodation", "Accommodation", "Accommadation"], correct: "C",
  },
  {
    key: "e-fill-since", subject: "ENGLISH", topic: "Fill in the Blanks", difficulty: "EASY",
    text: p("She has been living here ______ 2015."), options: ["for", "since", "from", "by"], correct: "B",
  },
  {
    key: "e-error", subject: "ENGLISH", topic: "Spotting Errors", difficulty: "EASY",
    text: p("Find the part of the sentence with an error: <em>He / do not / like coffee.</em>"), options: ["He", "do not", "like coffee", "No error"], correct: "B",
  },
  {
    key: "e-passive", subject: "ENGLISH", topic: "Active & Passive Voice", difficulty: "MEDIUM",
    text: p("Change to passive voice: <em>The cat chased the mouse.</em>"),
    options: ["The mouse chased the cat.", "The mouse was chased by the cat.", "The mouse is chased by the cat.", "The cat was chased by the mouse."], correct: "B",
  },
  {
    key: "e-narration", subject: "ENGLISH", topic: "Direct & Indirect Speech", difficulty: "MEDIUM",
    text: p("Change to indirect speech: <em>He said, \"I am tired.\"</em>"),
    options: ["He said that he is tired.", "He said that he was tired.", "He said that I was tired.", "He told that he is tired."], correct: "B",
  },
  {
    key: "e-ant-untagged", subject: "ENGLISH", topic: null, difficulty: "EASY",
    text: p("Choose the word opposite in meaning to <strong>ANCIENT</strong>."), options: ["Old", "Modern", "Historic", "Antique"], correct: "B",
  },
  {
    key: "e-rc-1", subject: "ENGLISH", topic: "Reading Comprehension", difficulty: "MEDIUM", type: "PASSAGE", passage: "passage-bees",
    text: p("According to the passage, why are bees important to farmers?"),
    options: ["They produce honey for sale", "They pollinate crops", "They keep pests away", "They improve soil quality"], correct: "B",
  },
  {
    key: "e-rc-2", subject: "ENGLISH", topic: "Reading Comprehension", difficulty: "MEDIUM", type: "PASSAGE", passage: "passage-bees",
    text: p("Which of the following is mentioned as a threat to bees?"),
    options: ["Cold winters", "Pesticides", "Birds", "Rainfall"], correct: "B",
  },
  {
    key: "e-rc-3", subject: "ENGLISH", topic: "Reading Comprehension", difficulty: "HARD", type: "PASSAGE", passage: "passage-bees",
    text: p("What is the tone of the passage?"), options: ["Humorous", "Concerned", "Indifferent", "Celebratory"], correct: "B",
  },
  {
    key: "e-live-syn", subject: "ENGLISH", topic: "Synonyms & Antonyms", difficulty: "EASY",
    text: p("Choose the synonym of <strong>BRAVE</strong>."), options: ["Timid", "Courageous", "Weak", "Lazy"], correct: "B",
  },
  {
    key: "e-upcoming-ows", subject: "ENGLISH", topic: "One Word Substitution", difficulty: "MEDIUM",
    text: p("A person who does not believe in the existence of God."), options: ["Theist", "Atheist", "Agnostic", "Pagan"], correct: "B",
  },

  {
    key: "e-rc-upi-1", subject: "ENGLISH", topic: "Reading Comprehension", difficulty: "EASY", type: "PASSAGE", passage: "passage-upi",
    text: p("According to the passage, what made quick mobile payments possible?"),
    options: ["Credit cards", "The Unified Payments Interface", "Cash on delivery", "Cheque books"], correct: "B",
  },
  {
    key: "e-rc-upi-2", subject: "ENGLISH", topic: "Reading Comprehension", difficulty: "MEDIUM", type: "PASSAGE", passage: "passage-upi",
    text: p("Which group is said to still find the technology confusing?"),
    options: ["Street vendors", "Small traders", "Elderly and rural users", "Bank employees"], correct: "C",
  },
  {
    key: "e-rc-upi-3", subject: "ENGLISH", topic: "Reading Comprehension", difficulty: "MEDIUM", type: "PASSAGE", passage: "passage-upi",
    text: p("What do experts consider as important as access?"),
    options: ["Speed", "Profit", "Smartphones", "Awareness"], correct: "D",
  },

  // ── GK ──
  {
    key: "g-maurya", subject: "GK", topic: "Indian History", difficulty: "EASY",
    text: p("Who founded the Maurya Empire?"), options: ["Ashoka", "Bindusara", "Chandragupta Maurya", "Bimbisara"], correct: "C",
    hi: { text: p("मौर्य साम्राज्य की स्थापना किसने की?"), options: ["अशोक", "बिंदुसार", "चंद्रगुप्त मौर्य", "बिंबिसार"] },
  },
  {
    key: "g-article-21", subject: "GK", topic: "Indian Polity & Constitution", difficulty: "MEDIUM",
    text: p("Article 21 of the Indian Constitution deals with:"),
    options: ["Right to Equality", "Protection of life and personal liberty", "Freedom of religion", "Right to constitutional remedies"], correct: "B",
    hi: {
      text: p("भारतीय संविधान का अनुच्छेद 21 किससे संबंधित है?"),
      options: ["समानता का अधिकार", "प्राण और दैहिक स्वतंत्रता का संरक्षण", "धर्म की स्वतंत्रता", "संवैधानिक उपचारों का अधिकार"],
    },
  },
  {
    key: "g-duties", subject: "GK", topic: "Indian Polity & Constitution", difficulty: "MEDIUM",
    text: p("How many Fundamental Duties are listed in the Indian Constitution?"), options: ["10", "11", "12", "9"], correct: "B",
    hi: { text: p("भारतीय संविधान में कितने मौलिक कर्तव्य सूचीबद्ध हैं?"), options: ["10", "11", "12", "9"] },
  },
  {
    key: "g-ganga", subject: "GK", topic: "Geography (India & World)", difficulty: "EASY",
    text: p("Which is the longest river in India?"), options: ["Godavari", "Yamuna", "Ganga", "Brahmaputra"], correct: "C",
    hi: { text: p("भारत की सबसे लंबी नदी कौन-सी है?"), options: ["गोदावरी", "यमुना", "गंगा", "ब्रह्मपुत्र"] },
  },
  {
    key: "g-newton", subject: "GK", topic: "General Science — Physics", difficulty: "EASY",
    text: p("What is the SI unit of force?"), options: ["Joule", "Newton", "Watt", "Pascal"], correct: "B",
    hi: { text: p("बल का SI मात्रक क्या है?"), options: ["जूल", "न्यूटन", "वाट", "पास्कल"] },
  },
  {
    key: "g-nacl", subject: "GK", topic: "General Science — Chemistry", difficulty: "EASY",
    text: p("What is the chemical formula of common salt?"), options: ["KCl", "NaCl", "NaOH", "CaCl<sub>2</sub>"], correct: "B",
  },
  {
    key: "g-mitochondria", subject: "GK", topic: "General Science — Biology", difficulty: "EASY",
    text: p("Which organelle is known as the powerhouse of the cell?"), options: ["Nucleus", "Ribosome", "Mitochondria", "Golgi body"], correct: "C",
    hi: { text: p("कोशिका का पावरहाउस किस कोशिकांग को कहा जाता है?"), options: ["केंद्रक", "राइबोसोम", "माइटोकॉन्ड्रिया", "गॉल्जी काय"] },
  },
  {
    key: "g-rbi", subject: "GK", topic: "Indian Economy", difficulty: "MEDIUM",
    text: p("In which year was the Reserve Bank of India established?"), options: ["1935", "1947", "1949", "1950"], correct: "A",
  },
  {
    key: "g-sports-day", subject: "GK", topic: "Static GK (Books, Awards, Days)", difficulty: "MEDIUM",
    text: p("National Sports Day in India is observed on:"), options: ["15 August", "29 August", "5 September", "2 October"], correct: "B",
  },
  {
    key: "g-hockey", subject: "GK", topic: "Sports", difficulty: "EASY",
    text: p("How many players does a field hockey team have on the field?"), options: ["9", "10", "11", "12"], correct: "C",
  },
  {
    key: "g-cpu", subject: "GK", topic: "Computer & Technology", difficulty: "EASY",
    text: p("What does CPU stand for?"), options: ["Central Processing Unit", "Central Program Utility", "Computer Personal Unit", "Control Processing Unit"], correct: "A",
  },
  {
    key: "g-bharatanatyam", subject: "GK", topic: "Art & Culture", difficulty: "EASY",
    text: p("Bharatanatyam originated in which state?"), options: ["Kerala", "Tamil Nadu", "Odisha", "Andhra Pradesh"], correct: "B",
  },
  {
    key: "g-canberra-untagged", subject: "GK", topic: null, difficulty: "EASY",
    text: p("What is the capital of Australia?"), options: ["Sydney", "Melbourne", "Canberra", "Perth"], correct: "C",
  },
  {
    key: "g-live-history", subject: "GK", topic: "Indian History", difficulty: "MEDIUM",
    text: p("The Battle of Plassey was fought in which year?"), options: ["1757", "1764", "1857", "1761"], correct: "A",
  },
  {
    key: "g-upcoming-science", subject: "GK", topic: "General Science — Physics", difficulty: "EASY",
    text: p("What is the SI unit of electric current?"), options: ["Volt", "Ohm", "Ampere", "Coulomb"], correct: "C",
  },
];

export const PASSAGES = {
  "table-sales": {
    title: "Sales of a company (₹ lakh)",
    content: p("The table shows the annual sales of two products of a company."),
    type: "TABLE" as const,
    tableData: {
      headers: ["Year", "Product A", "Product B"],
      rows: [["2021", "35", "20"], ["2022", "40", "25"], ["2023", "45", "30"], ["2024", "50", "40"]],
    },
    hi: {
      title: "एक कंपनी की बिक्री (₹ लाख)",
      content: p("तालिका एक कंपनी के दो उत्पादों की वार्षिक बिक्री दर्शाती है।"),
      tableData: {
        headers: ["वर्ष", "उत्पाद A", "उत्पाद B"],
        rows: [["2021", "35", "20"], ["2022", "40", "25"], ["2023", "45", "30"], ["2024", "50", "40"]],
      },
    },
  },
  "passage-bees": {
    title: "Why bees matter",
    content:
      p("Bees are among the most important insects on the planet. As they move from flower to flower collecting nectar, they carry pollen that allows plants to produce fruit and seeds. A large share of the crops that farmers grow depend on this pollination.") +
      p("In recent decades, bee populations have fallen sharply. Scientists point to the widespread use of pesticides, the loss of wild flowers and disease as the main causes. If the decline continues, food prices could rise and many crops could fail."),
    type: "TEXT" as const,
    tableData: null,
    hi: null,
  },
  "passage-upi": {
    title: "Paying by phone",
    content:
      p("Over the last decade, digital payments have changed how India shops. With a smartphone and a bank account, a person can now pay a street vendor in seconds. The Unified Payments Interface, launched in 2016, made this possible by linking bank accounts to simple mobile apps.") +
      p("Small traders benefit because they no longer need to keep large amounts of change. However, experts warn that many elderly and rural users still find the technology confusing, and that fraud through fake payment requests is rising. Awareness, they argue, is as important as access."),
    type: "TEXT" as const,
    tableData: null,
    hi: null,
  },
};
