// Everything anybody says. The narrator looks back on what happened (we /
// I, depending on how many of you there are); dispatch talks over the
// radio; Ranger Pruitt drops you off; and Wade, who says he's a hiker.

// how the days go: hours of the day (past 24 means the next morning)
export const SEGMENTS = [
  { id: 'intro', title: '', from: 18.85, to: 19.1 },
  { id: 'day1', title: 'DAY ONE', sub: 'Evening', from: 19.1, to: 21.3, len: 420 },
  { id: 'night1', title: 'THAT NIGHT', sub: '2:14 AM', from: 26.23, to: 27.6, len: 240 },
  { id: 'day2', title: 'DAY TWO', sub: 'Morning', from: 8.3, to: 12.6, len: 460 },
  { id: 'evening2', title: 'THAT EVENING', sub: '6:40 PM', from: 18.65, to: 21.4, len: 260 },
  { id: 'night2', title: 'THE SECOND NIGHT', sub: '11:20 PM', from: 23.33, to: 29.0, len: 380 },
  { id: 'day3', title: 'DAY THREE', sub: 'Dawn', from: 5.5, to: 8.6, len: 480 },
];

// what the narrator says before each part (solo players get the singular)
export const NARRATION = {
  intro: [
    'In June of 2004, {we} signed on {as} at Cinder Peak.',
    'Two weeks in a glass room on top of a steel tower, watching a hundred square miles of forest for smoke.',
    'The lookout before {us} had quit three weeks into the season. The ranger said he just walked off one day.',
    '{We} didn\'t think much of it.',
  ],
  night1: ['{We} were asleep before eleven.', 'Sometime after two in the morning, something woke {us} up.'],
  day2: ['In the morning it all seemed a little silly.', 'The forest looks so ordinary in daylight.'],
  evening2: ['{We} spent the afternoon trying not to talk about him.'],
  night2: ['Nobody slept that night.'],
  day3: ['When the sun came up, the radio was dead.'],
};

export const RANGER = [
  'Here she is. Cinder Peak. Best view in the district.',
  'Your supplies are in the truck bed. Generator\'s by the shed, the radio\'s up top.',
  'Check in with dispatch tonight, so they know you made it.',
  'And keep the trapdoor shut at night. Critters climb.',
  'I\'ll be back for you in two weeks. Enjoy the quiet.',
];

// the old logbook on the desk: his
export const LOGBOOK = [
  ['June 2', 'Arrived. Generator runs rough. The view is unbelievable.'],
  ['June 8', 'Elk at the spring every morning. Bear on the road at dusk.'],
  ['June 14', 'Nobody to talk to but dispatch. I have started talking to the trees. They listen better.'],
  ['June 19', 'Dispatch says they are sending relief at the end of the month. I didn\'t ask for relief.'],
  ['June 21', 'THIS IS MY TOWER'],
];

export const WORDS = ['HEMLOCK', 'TAMARACK', 'JUNIPER', 'BLUEJAY', 'CEDAR', 'OSPREY', 'BALSAM', 'KESTREL'];

export const DISPATCH = {
  checkin: [
    'Cinder Peak, this is Lyle Creek dispatch. Good to hear you. Welcome aboard.',
    'One thing. If anybody ever calls you on this channel saying they\'re us, you ask them for the word.',
    'This week the word is {word}. Write it down. Dispatch out.',
  ],
  goodnight: ['Cinder Peak, dispatch. Quiet night on our end. Get some sleep, you\'ve got an early one.'],
  morning: [
    'Cinder Peak, dispatch. Morning. Air patrol reported a smoke somewhere east of you.',
    'Get me a bearing off your fire finder when you can.',
    'And the biologists want the pictures off that elk camera by the outhouse. Have a look at them for me.',
  ],
  bearingGood: ['Copy, {b} degrees. That lines up with the pilot. That\'s the Lyle Creek drainage. Crew\'s on the way. Nice work, Cinder Peak.'],
  bearingBad: ['Hm. {b} doesn\'t line up with what the pilot saw. Check it again for me?'],
  noBearing: ['Copy. Let me know when you\'ve got a bearing on it.'],
  camera: ['Probably just a hiker. Folks wander up there. If he bothers you, call it in.'],
  verify: [
    'Negative, Cinder Peak. Nobody\'s scheduled up there till the end of the month.',
    'What\'s he look like?',
  ],
  reveal: [
    'Cinder Peak, listen to me. The last lookout up there was a fellow named Wade Gentry.',
    'Quit three weeks back. Never turned in his keys. Never came down, far as anybody knows.',
    'If that\'s him, do not let him up. I\'ll have the sheriff swing by in the morning.',
  ],
  revealAgain: ['Stay inside tonight, Cinder Peak. Keep that trapdoor bolted.'],
  // the first night, a voice on the channel at two in the morning
  nightCall: ['(Static. Somebody keys the mic and breathes into it.)', '...Cinder Peak.', '...You awake up there?'],
  nightCallReply: ['...Nobody. A neighbour.', 'Go back to bed, Cinder Peak. I\'ll keep an eye on you.'],
  nightGoodnight: ['...Sleep tight, Cinder Peak.'],
  morningCall: 'And Cinder Peak, somebody was keying up on this channel around two this morning. It wasn\'t us.',
  // him, pretending
  fake: ['Cinder Peak, dispatch. We\'ve got a deputy down at your gate. His truck\'s having trouble.', 'Need one of you to walk down and open it for him.'],
  fakeWord: ['...the word.', '...{wrong}.', 'Come on down anyway.'],
  fakeIgnored: ['...Cinder Peak?', 'I can see your light, Cinder Peak.'],
  dead: ['(Static. Nothing but static.)'],
};

export const WADE = {
  hello: 'Evening!',
  helloReplies: ['Just passing through. Been walking since sunup.', 'Nobody, really. Name\'s Wade. I walk these woods.', 'Is it now. Funny. I never saw a sign.'],
  askWater: 'Long way down to the creek. Mind if I fill my bottle from your tank?',
  gave: 'Kind of you. Not everybody up here is kind.',
  refused: '...Sure. It\'s your tank.',
  took: 'Guess nobody minds.',
  leaving: 'Nice view up there. I used to love that view.',
  knock: ['I know you\'re awake.', 'Room for one more up there?', 'You left me out here.'],
  peek: 'Just wanted to see who\'s sleeping in my bed.',
  slammed: 'That wasn\'t very neighbourly.',
  relief: ['Hello up there! Ranger Pruitt sent me up!', 'Radio\'s been cutting in and out on your channel. I\'m supposed to look at your antenna.'],
  reliefBolted: 'You\'ll have to open the hatch for me.',
  inCab: ['Huh. You moved the cot.', 'Antenna looks fine to me.', 'You all have a good night now.'],
  checked: ['Something wrong?', 'Suit yourselves. I\'ll be around.'],
  declined: 'Suit yourselves.',
  catwalk: ['It\'s my tower.', 'You\'re standing where I used to stand.', 'I can see you.'],
  gate: 'Thanks for coming down.',
  hunt: ['There you are.', 'Don\'t run.', 'I just want my tower back.'],
  breach: 'Lights out.',
  finale: ['You took my keys.', 'Nobody leaves the mountain.'],
};

export const ASK = {
  hello: ['Hi... can we help you?', 'Who are you?', 'This area\'s closed to hikers.'],
  water: ['Sure, help yourself.', 'Sorry, we need it for ourselves.'],
  relief: ['Come on up.', 'Hang on, we\'ll check with dispatch.', 'We\'re fine, thanks.'],
  fake: ['What\'s the word?', 'Copy. We\'ll head down.', '(Don\'t answer.)'],
};

// what you can say into the radio, by option id
export const RADIO_LINES = {
  checkin: 'Dispatch, this is Cinder Peak, checking in.',
  smoke: 'Dispatch, Cinder Peak. Smoke at bearing {b} degrees.',
  camera: 'There\'s somebody on the elk camera. At night. Right under the tower.',
  verify: 'Dispatch, did you send someone up here? Says Pruitt sent him.',
  stranger: 'There\'s a man hanging around the tower. Says his name is Wade.',
  help: 'Dispatch, Cinder Peak! We need help! Can anybody hear me?',
  who: 'This is Cinder Peak. Who is this?',
};

// quick shouts, keys 1-4 when nobody's asking you anything
export const SHOUTS = ['Over here!', 'Did you hear that?', 'He\'s here!', 'Wait for me!'];

export const TEXTS = {
  day1: [['Mom', 'Did you make it up there ok? Text me when you can!! Love you'], ['Jess', 'send pics of the view or it didnt happen']],
  day2: [['Mom', 'Saw on the news theres a fire somewhere near you?? Be careful']],
  night2: [['Unknown', 'you left the light on'], ['Unknown', 'which one of you is sleeping in my bed']],
  sheriff: [['Sheriff\'s Office', 'Deputy en route to Cinder Peak, ETA 15 min. Stay inside. Lock the doors.']],
};

export const ENDINGS = {
  escaped: {
    title: 'YOU GOT OFF THE MOUNTAIN',
    lines: ['{We} drove until {we} hit pavement, and didn\'t stop until {we} reached town.', 'Deputies searched Cinder Peak for three days. They found his camp, and the photographs.', 'They never found Wade Gentry.'],
  },
  rescued: {
    title: 'HELP CAME UP THE MOUNTAIN',
    lines: ['The deputy found {us} on the floor of the cab with everything {we} owned piled on the trapdoor.', 'They searched the peak for three days. They found his camp, and the photographs.', 'They never found Wade Gentry.'],
  },
  taken: {
    title: 'NOBODY CAME DOWN',
    lines: ['When Ranger Pruitt drove up at the end of the month, the lookout was empty.', 'The logbook had one new entry, in handwriting he knew.', '"Relief arrived. Sent them home. W.G."'],
  },
};
