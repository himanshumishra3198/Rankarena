// General Awareness: static facts that do not go out of date, one question
// per row, with the wrong options taken from other rows of the same table.
// Current affairs are left out on purpose — seed data would be stale within
// weeks.
import { Draft, family, mcq, p, shuffle } from "./lib";

const HISTORY = "Indian History";
const POLITY = "Indian Polity & Constitution";
const GEO = "Geography (India & World)";
const ECONOMY = "Indian Economy";
const PHYSICS = "General Science — Physics";
const CHEMISTRY = "General Science — Chemistry";
const BIOLOGY = "General Science — Biology";
const STATIC = "Static GK (Books, Awards, Days)";
const ART = "Art & Culture";
const SPORTS = "Sports";
const COMPUTER = "Computer & Technology";

const COUNTRY_CAPITALS: [string, string][] = [
  ["France", "Paris"], ["Germany", "Berlin"], ["Japan", "Tokyo"], ["Canada", "Ottawa"], ["Brazil", "Brasília"],
  ["Egypt", "Cairo"], ["Russia", "Moscow"], ["China", "Beijing"], ["Italy", "Rome"], ["Spain", "Madrid"],
  ["Nepal", "Kathmandu"], ["Bhutan", "Thimphu"], ["Bangladesh", "Dhaka"], ["Pakistan", "Islamabad"],
  ["Afghanistan", "Kabul"], ["Iran", "Tehran"], ["Iraq", "Baghdad"], ["Saudi Arabia", "Riyadh"], ["Turkey", "Ankara"],
  ["Kenya", "Nairobi"], ["Argentina", "Buenos Aires"], ["Thailand", "Bangkok"], ["Vietnam", "Hanoi"],
  ["South Korea", "Seoul"], ["Norway", "Oslo"], ["Sweden", "Stockholm"], ["Portugal", "Lisbon"], ["Greece", "Athens"],
  ["Myanmar", "Naypyidaw"], ["New Zealand", "Wellington"],
];
const STATE_CAPITALS: [string, string][] = [
  ["Rajasthan", "Jaipur"], ["Karnataka", "Bengaluru"], ["Tamil Nadu", "Chennai"], ["Kerala", "Thiruvananthapuram"],
  ["Gujarat", "Gandhinagar"], ["Madhya Pradesh", "Bhopal"], ["Uttar Pradesh", "Lucknow"], ["Bihar", "Patna"],
  ["West Bengal", "Kolkata"], ["Odisha", "Bhubaneswar"], ["Assam", "Dispur"], ["Telangana", "Hyderabad"],
  ["Jharkhand", "Ranchi"], ["Chhattisgarh", "Raipur"], ["Himachal Pradesh", "Shimla"], ["Goa", "Panaji"],
  ["Sikkim", "Gangtok"], ["Manipur", "Imphal"], ["Meghalaya", "Shillong"], ["Tripura", "Agartala"],
  ["Mizoram", "Aizawl"], ["Nagaland", "Kohima"], ["Arunachal Pradesh", "Itanagar"], ["Maharashtra", "Mumbai"],
];
const CURRENCIES: [string, string][] = [
  ["Japan", "Yen"], ["the United Kingdom", "Pound sterling"], ["Russia", "Rouble"], ["China", "Renminbi"],
  ["Bangladesh", "Taka"], ["Thailand", "Baht"], ["South Africa", "Rand"], ["Saudi Arabia", "Riyal"],
  ["Brazil", "Real"], ["Mexico", "Peso"], ["South Korea", "Won"], ["Malaysia", "Ringgit"], ["Vietnam", "Dong"],
  ["Turkey", "Lira"], ["Germany", "Euro"],
];
const BOOKS: [string, string][] = [
  ["Godan", "Munshi Premchand"], ["Gitanjali", "Rabindranath Tagore"], ["The Discovery of India", "Jawaharlal Nehru"],
  ["Wings of Fire", "A. P. J. Abdul Kalam"], ["Arthashastra", "Kautilya"], ["The God of Small Things", "Arundhati Roy"],
  ["Midnight's Children", "Salman Rushdie"], ["Malgudi Days", "R. K. Narayan"], ["India Wins Freedom", "Maulana Abul Kalam Azad"],
  ["The Story of My Experiments with Truth", "Mahatma Gandhi"], ["Train to Pakistan", "Khushwant Singh"],
  ["Anandmath", "Bankim Chandra Chattopadhyay"], ["Abhijnanashakuntalam", "Kalidasa"], ["Hamlet", "William Shakespeare"],
  ["The White Tiger", "Aravind Adiga"],
];
const DAYS: [string, string][] = [
  ["World Environment Day", "5 June"], ["International Yoga Day", "21 June"], ["World Health Day", "7 April"],
  ["Teachers' Day in India", "5 September"], ["National Youth Day in India", "12 January"], ["World Water Day", "22 March"],
  ["International Women's Day", "8 March"], ["Children's Day in India", "14 November"], ["World AIDS Day", "1 December"],
  ["National Science Day in India", "28 February"], ["Human Rights Day", "10 December"], ["Earth Day", "22 April"],
];
const ELEMENTS: [string, string][] = [
  ["gold", "Au"], ["silver", "Ag"], ["iron", "Fe"], ["sodium", "Na"], ["potassium", "K"], ["lead", "Pb"],
  ["copper", "Cu"], ["mercury", "Hg"], ["tin", "Sn"], ["zinc", "Zn"], ["calcium", "Ca"], ["helium", "He"], ["tungsten", "W"],
];
const FORMULAS: [string, string][] = [
  ["water", "H<sub>2</sub>O"], ["baking soda", "NaHCO<sub>3</sub>"], ["quicklime", "CaO"],
  ["limestone", "CaCO<sub>3</sub>"], ["laughing gas", "N<sub>2</sub>O"], ["carbon dioxide", "CO<sub>2</sub>"],
];
const SI_UNITS: [string, string][] = [
  ["energy", "Joule"], ["power", "Watt"], ["pressure", "Pascal"], ["electrical resistance", "Ohm"], ["frequency", "Hertz"],
  ["electric charge", "Coulomb"], ["potential difference", "Volt"], ["temperature", "Kelvin"], ["luminous intensity", "Candela"],
  ["mass", "Kilogram"], ["amount of substance", "Mole"], ["magnetic flux", "Weber"],
];
const VITAMINS: [string, string][] = [
  ["Vitamin C", "Scurvy"], ["Vitamin D", "Rickets"], ["Vitamin A", "Night blindness"], ["Vitamin B1", "Beriberi"],
  ["Vitamin B3", "Pellagra"], ["Vitamin B12", "Pernicious anaemia"],
];
const EVENTS: [string, string][] = [
  ["the First Battle of Panipat", "1526"], ["the Battle of Buxar", "1764"], ["the First War of Indian Independence", "1857"],
  ["the Jallianwala Bagh massacre", "1919"], ["the Dandi March", "1930"], ["the Quit India Movement", "1942"],
  ["the Partition of Bengal", "1905"], ["the founding of the Indian National Congress", "1885"],
  ["the launch of the Non-Cooperation Movement", "1920"], ["the arrival of the Simon Commission", "1928"],
  ["the Third Battle of Panipat", "1761"], ["the Battle of Haldighati", "1576"], ["the formation of the All-India Muslim League", "1906"],
  ["the Cabinet Mission's visit to India", "1946"],
];
const FOUNDERS: [string, string][] = [
  ["Mughal Empire", "Babur"], ["Slave dynasty", "Qutb-ud-din Aibak"], ["Khilji dynasty", "Jalal-ud-din Khilji"],
  ["Tughlaq dynasty", "Ghiyas-ud-din Tughlaq"], ["Lodi dynasty", "Bahlul Lodi"], ["Sur Empire", "Sher Shah Suri"],
  ["Maratha Empire", "Shivaji"], ["Sikh Empire", "Ranjit Singh"],
];
const ARTICLES: [string, string][] = [
  ["14", "Equality before law"], ["17", "Abolition of untouchability"], ["19", "Freedom of speech and expression, among others"],
  ["21A", "Right to education"], ["32", "Right to constitutional remedies"], ["44", "Uniform civil code"],
  ["51A", "Fundamental duties"], ["110", "Definition of money bills"], ["280", "Finance Commission"],
  ["324", "Election Commission"], ["352", "Proclamation of national emergency"], ["360", "Financial emergency"],
];
const TROPHIES: [string, string][] = [
  ["Ranji Trophy", "Cricket"], ["Durand Cup", "Football"], ["Thomas Cup", "Badminton"], ["Davis Cup", "Tennis"],
  ["Ryder Cup", "Golf"], ["Stanley Cup", "Ice hockey"], ["Aga Khan Cup", "Hockey"], ["Uber Cup", "Badminton"],
  ["Duleep Trophy", "Cricket"], ["Subroto Cup", "Football"], ["Wimbledon", "Tennis"], ["Santosh Trophy", "Football"],
];
const PLAYERS: [string, string][] = [["basketball", "5"], ["volleyball", "6"], ["kabaddi", "7"], ["polo", "4"], ["football", "11"]];
const DANCES: [string, string][] = [
  ["Kathakali", "Kerala"], ["Kuchipudi", "Andhra Pradesh"], ["Odissi", "Odisha"], ["Bihu", "Assam"], ["Garba", "Gujarat"],
  ["Bhangra", "Punjab"], ["Ghoomar", "Rajasthan"], ["Lavani", "Maharashtra"], ["Manipuri", "Manipur"], ["Yakshagana", "Karnataka"],
];
const FESTIVALS: [string, string][] = [
  ["Pongal", "Tamil Nadu"], ["Onam", "Kerala"], ["Hornbill Festival", "Nagaland"], ["Gangaur", "Rajasthan"], ["Nuakhai", "Odisha"], ["Chhath", "Bihar"],
];
const ABBREVIATIONS: [string, string][] = [
  ["RAM", "Random Access Memory"], ["ROM", "Read Only Memory"], ["URL", "Uniform Resource Locator"],
  ["HTTP", "HyperText Transfer Protocol"], ["USB", "Universal Serial Bus"], ["PDF", "Portable Document Format"],
  ["LAN", "Local Area Network"], ["GUI", "Graphical User Interface"], ["ALU", "Arithmetic Logic Unit"],
  ["BIOS", "Basic Input/Output System"], ["DNS", "Domain Name System"], ["ISP", "Internet Service Provider"],
  ["HTML", "HyperText Markup Language"],
];
const INVENTIONS: [string, string][] = [
  ["telephone", "Alexander Graham Bell"], ["electric light bulb", "Thomas Edison"], ["radio", "Guglielmo Marconi"],
  ["World Wide Web", "Tim Berners-Lee"], ["dynamite", "Alfred Nobel"], ["television", "John Logie Baird"],
  ["aeroplane", "The Wright brothers"],
];

/** Questions that do not fit a table: [topic, question, answer, three wrong options]. */
const SINGLES: [string, string, string, [string, string, string]][] = [
  [GEO, "Which is the largest ocean in the world?", "Pacific Ocean", ["Atlantic Ocean", "Indian Ocean", "Arctic Ocean"]],
  [GEO, "Which is the largest state of India by area?", "Rajasthan", ["Madhya Pradesh", "Maharashtra", "Uttar Pradesh"]],
  [GEO, "Which river is known as the 'Sorrow of Bihar'?", "Kosi", ["Gandak", "Son", "Ghaghara"]],
  [GEO, "The Palk Strait separates India from:", "Sri Lanka", ["Maldives", "Myanmar", "Bangladesh"]],
  [GEO, "Which is the largest desert in India?", "Thar", ["Rann of Kutch", "Ladakh", "Spiti"]],
  [GEO, "Which is the smallest continent by area?", "Australia", ["Europe", "Antarctica", "South America"]],
  [PHYSICS, "Which mirror is used as a rear-view mirror in vehicles?", "Convex mirror", ["Concave mirror", "Plane mirror", "Cylindrical mirror"]],
  [PHYSICS, "Sound cannot travel through:", "A vacuum", ["Water", "Steel", "Air"]],
  [PHYSICS, "A rainbow is formed due to:", "Dispersion of light", ["Reflection only", "Diffraction of sound", "Polarisation"]],
  [PHYSICS, "Which planet is known as the Red Planet?", "Mars", ["Jupiter", "Venus", "Saturn"]],
  [BIOLOGY, "Which is the largest organ of the human body?", "Skin", ["Liver", "Heart", "Brain"]],
  [BIOLOGY, "How many bones are there in an adult human body?", "206", ["201", "212", "196"]],
  [BIOLOGY, "Which organ produces insulin?", "Pancreas", ["Liver", "Kidney", "Stomach"]],
  [BIOLOGY, "Which blood group is known as the universal donor?", "O negative", ["AB positive", "A positive", "B negative"]],
  [BIOLOGY, "In which part of a plant cell does photosynthesis take place?", "Chloroplast", ["Mitochondria", "Nucleus", "Vacuole"]],
  [BIOLOGY, "Which blood cells help fight infection?", "White blood cells", ["Red blood cells", "Platelets", "Plasma cells"]],
  [POLITY, "Who appoints the Chief Justice of India?", "The President", ["The Prime Minister", "The Parliament", "The Law Minister"]],
  [POLITY, "What is the minimum age to become the President of India?", "35 years", ["25 years", "30 years", "40 years"]],
  [POLITY, "Who is the ex-officio Chairman of the Rajya Sabha?", "The Vice-President", ["The President", "The Speaker", "The Prime Minister"]],
  [POLITY, "The Constitution of India came into force on:", "26 January 1950", ["15 August 1947", "26 November 1949", "26 January 1949"]],
  [POLITY, "Fundamental Rights are contained in which Part of the Constitution?", "Part III", ["Part IV", "Part II", "Part V"]],
  [POLITY, "Directive Principles of State Policy are contained in which Part of the Constitution?", "Part IV", ["Part III", "Part V", "Part VI"]],
  [ECONOMY, "Where is the headquarters of the Reserve Bank of India?", "Mumbai", ["New Delhi", "Kolkata", "Chennai"]],
  [ECONOMY, "NITI Aayog replaced the Planning Commission in which year?", "2015", ["2014", "2016", "2017"]],
  [ECONOMY, "In which year did GST come into force in India?", "2017", ["2015", "2016", "2018"]],
  [ECONOMY, "Who signs the ₹1 currency note in India?", "The Finance Secretary", ["The RBI Governor", "The Finance Minister", "The President"]],
  [ECONOMY, "SEBI regulates which of the following?", "The securities market", ["The banking sector", "Insurance companies", "Foreign trade"]],
  [ECONOMY, "Which body sets the repo rate in India?", "The Reserve Bank of India", ["The Ministry of Finance", "NITI Aayog", "SEBI"]],
  [COMPUTER, "How many bits make one byte?", "8", ["4", "16", "32"]],
  [COMPUTER, "Which of these is an input device?", "Keyboard", ["Monitor", "Printer", "Speaker"]],
  [COMPUTER, "Which of these is an operating system?", "Linux", ["Oracle", "Python", "Excel"]],
  [COMPUTER, "Who is known as the father of the computer?", "Charles Babbage", ["Alan Turing", "Bill Gates", "Tim Berners-Lee"]],
  [COMPUTER, "Which keyboard shortcut copies selected text in Windows?", "Ctrl + C", ["Ctrl + V", "Ctrl + X", "Ctrl + Z"]],
];

export function gkFamilies(): Draft[][] {
  return [
    family(COUNTRY_CAPITALS, GEO, "EASY", ([c]) => `What is the capital of ${c}?`, ([, a]) => a),
    family(STATE_CAPITALS, GEO, "EASY", ([s]) => `What is the capital of ${s}?`, ([, a]) => a),
    family(CURRENCIES, STATIC, "EASY", ([c]) => `What is the currency of ${c}?`, ([, a]) => a),
    family(BOOKS, STATIC, "MEDIUM", ([b]) => `Who wrote <em>${b}</em>?`, ([, a]) => a),
    family(DAYS, STATIC, "MEDIUM", ([d]) => `${d} is observed on:`, ([, a]) => a),
    family(ELEMENTS, CHEMISTRY, "EASY", ([e]) => `What is the chemical symbol of ${e}?`, ([, a]) => a),
    family(FORMULAS, CHEMISTRY, "EASY", ([c]) => `What is the chemical formula of ${c}?`, ([, a]) => a),
    family(SI_UNITS, PHYSICS, "EASY", ([q]) => `What is the SI unit of ${q}?`, ([, a]) => a),
    family(VITAMINS, BIOLOGY, "MEDIUM", ([v]) => `Deficiency of ${v} causes:`, ([, a]) => a),
    family(EVENTS, HISTORY, "MEDIUM", ([e]) => `In which year did ${e} take place?`, ([, a]) => a),
    family(FOUNDERS, HISTORY, "MEDIUM", ([d]) => `Who founded the ${d}?`, ([, a]) => a),
    family(ARTICLES, POLITY, "HARD", ([n]) => `Article ${n} of the Indian Constitution deals with:`, ([, a]) => a),
    family(TROPHIES, SPORTS, "EASY", ([t]) => `The ${t} is associated with which sport?`, ([, a]) => a),
    PLAYERS.map(([g, n]) => {
      const { options, correct } = mcq(n, ["4", "5", "6", "7", "9", "11"]);
      return { topic: SPORTS, difficulty: "EASY" as const, text: p(`How many players does each side have on the field or court in ${g}?`), options, correct };
    }),
    family(DANCES, ART, "EASY", ([d]) => `${d} is a dance form of which state?`, ([, a]) => a),
    family(FESTIVALS, ART, "EASY", ([f]) => `${f} is mainly celebrated in which state?`, ([, a]) => a),
    family(ABBREVIATIONS, COMPUTER, "EASY", ([x]) => `What does ${x} stand for?`, ([, a]) => a),
    family(INVENTIONS, STATIC, "EASY", ([x]) => `Who invented the ${x}?`, ([, a]) => a),
    SINGLES.map(([topic, q, right, wrong]) => {
      const { options, correct } = mcq(right, wrong);
      return { topic, difficulty: "EASY" as const, text: p(q), options, correct };
    }),
  ].map((f) => shuffle(f));
}
