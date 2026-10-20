// Everything anyone says. {name} is filled in with one of the players.
// Visitors have two scripts: the real person, and the same face with him
// wearing it. The words are close; the way they say them isn't.

export const HIM = {
  intro: ['Fifty.', 'Same floor. Isn\'t that nice.'],
  knock: ['I know you\'re in there.', 'Open the door, {name}.', 'I just want to talk.', 'It\'s rude to keep a guest waiting.', 'I can hear you breathing.', 'You left so quickly. In the elevator.'],
  angry: ['OPEN THE DOOR.', 'I can do this all night, {name}.', 'Don\'t make me let myself in.', 'Knock knock.'],
  force: ['Here I come.', 'Almost...', 'This lock is cheap, {name}.'],
  unlocked: ['You left it open for me.', 'Thank you, {name}.'],
  talk: [
    'Hello again, {name}.',
    'Nice view from up here. I watched you in the window.',
    'Aren\'t you going to invite me in?',
    'I\'ll be right here. All night.',
    'You have such nice friends. I\'d like to meet them. Properly.',
    'I\'m not going to hurt anyone. Just open the door the rest of the way.',
    'Do you know how many people live on this floor, {name}? I do.',
  ],
  leave: ['Goodnight, {name}.', 'I\'ll see you soon.', 'Sleep well.'],
  whoIsIt: ['A friend.', 'You know who.', 'Your neighbour.', 'Room service.'],
  want: ['You.', 'Just to come in.', 'Five minutes.'],
  goAway: ['No.', 'I always come back.', 'Make me.'],
  inside: ['There you are.', 'Hide and seek. My favourite.', 'I can hear your heart, {name}.', 'Come out, come out.'],
  found: ['Found you.'],
  lose: ['I\'ll be back for the rest of you.', 'One down.'],
  silent: ['...'],
};

// Visitors. `real` lines for the person, `him` lines when he's wearing them.
export const VISITORS = {
  neighbor: {
    name: 'Margaret (50D)', route: 'across', knock: 'polite',
    real: {
      arrive: ['Hello? It\'s Margaret, from across the hall.', 'Sorry to bother you, dears.'],
      whoIsIt: ['It\'s Margaret, from 50D. I made far too many cookies.', 'Margaret! From across the hall.'],
      want: ['Just to drop off some cookies. And I heard banging earlier, is everything all right?', 'I baked. You young people never eat properly.'],
      goAway: ['Well! Suit yourselves.', 'Fine, fine. Goodnight.'],
      chain: ['You can take the chain off, dear. They won\'t fit through the gap.'],
      give: ['There you are. Lock up behind me, there\'s a strange man about.'],
      leave: ['Never mind. Goodnight, dears.'],
    },
    him: {
      arrive: ['Hello? It\'s Margaret. From across the hall.'],
      whoIsIt: ['It\'s Margaret. From. Across the hall.', 'Margaret. You know me, {name}.'],
      want: ['Let me in. I made cookies.', 'I\'m frightened. Let me in, dear. Let me in.'],
      goAway: ['That\'s not very neighbourly, {name}.', 'I\'ll wait.'],
      chain: ['Take the chain off, dear.', 'Take. The chain. Off.'],
      leave: ['...'],
    },
  },
  delivery: {
    name: 'Delivery driver', route: 'elevator', knock: 'rapid',
    real: {
      arrive: ['Delivery!', 'Pizza for 50C?'],
      whoIsIt: ['Delivery. Large pepperoni for 50C?', 'Pizza delivery.'],
      want: ['Somebody ordered a pizza to 50C. It\'s already paid.', 'Just need to drop this off, man.'],
      goAway: ['Okay, whatever. I\'m leaving it with the front desk.', 'Seriously? Fine.'],
      chain: ['Uh, the box won\'t fit through there.'],
      give: ['Here you go. Enjoy. Hey, there\'s a weird guy in the stairwell, by the way.'],
      leave: ['Nobody home? Great.'],
    },
    him: {
      arrive: ['Delivery.'],
      whoIsIt: ['Delivery. For {name}.', 'Pizza. For 50C. For you.'],
      want: ['I need to bring it inside.', 'You have to sign. Inside.'],
      goAway: ['It\'s already paid for, {name}.', 'I\'ll wait. It\'s getting cold.'],
      chain: ['Take the chain off. It won\'t fit.', 'Open it all the way.'],
      leave: ['...'],
    },
  },
  super: {
    name: 'Building super', route: 'stairs', knock: 'heavy',
    real: {
      arrive: ['Maintenance!', 'It\'s Frank, the super.'],
      whoIsIt: ['Frank. Building maintenance.', 'It\'s the super. Frank.'],
      want: ['Couple of tenants said someone\'s been messing with the locks on this floor. Let me take a look at yours.', 'Checking the door locks on fifty. Won\'t take a minute.'],
      goAway: ['Your funeral, pal.', 'All right, all right. Call down if you need me.'],
      chain: ['I need the door open to look at the bolt, pal.'],
      give: ['There. New strike plate. That deadbolt\'ll hold now.'],
      leave: ['Guess nobody\'s home.'],
    },
    him: {
      arrive: ['Maintenance.'],
      whoIsIt: ['Frank. The super. You know Frank, {name}.', 'Maintenance.'],
      want: ['There\'s a gas leak. I need to come inside. Now.', 'I need to check inside the apartment.'],
      goAway: ['You\'re in danger in there, {name}. Let me in.', 'I have keys, you know.'],
      chain: ['Chain off. Gas leak. Hurry.'],
      leave: ['...'],
    },
  },
  police: {
    name: 'Police officer', route: 'elevator', knock: 'heavy',
    real: {
      arrive: ['Police. We got a call from this floor.', 'Police, anybody home?'],
      whoIsIt: ['Officer Daniels. We got a call about a prowler on fifty.', 'Police.'],
      want: ['Just checking everyone\'s all right. Someone reported a man in a long coat bothering residents.', 'Making sure you\'re okay. Seen anyone suspicious?'],
      goAway: ['All right. Keep it locked.', 'Okay. We\'ll keep an eye on the floor.'],
      chain: ['That\'s fine. You can open it, I just need to see you\'re all okay.'],
      give: ['Okay. I\'ll be patrolling the stairwell for a while. Keep your door locked.'],
      leave: ['No answer. Moving on.'],
    },
    him: {
      arrive: ['Police.'],
      whoIsIt: ['Police. Open up, {name}.', 'Officer. Daniels.'],
      want: ['I need to come in and check the apartment.', 'There\'s a man in your apartment. Let me in.'],
      goAway: ['Obstruction, {name}.', 'Open the door. That\'s an order.'],
      chain: ['Take the chain off.', 'All the way, please.'],
      leave: ['...'],
    },
  },
  // one of your friends, after he took them
  friend: {
    name: '', route: 'stairs', knock: 'him',
    him: {
      arrive: ['Guys! Guys, it\'s me! Open the door!', 'He\'s gone! Let me in, please!'],
      whoIsIt: ['It\'s me! It\'s {self}! Come on!', 'Who do you think? Let me in!'],
      want: ['I got away from him. Please, he\'s coming back!', 'Let me in let me in let me in.'],
      goAway: ['{name}... why would you say that?', 'I thought we were friends, {name}.'],
      chain: ['Take the chain off, hurry, he\'s coming!', 'All the way. Open it all the way.'],
      leave: ['...'],
    },
  },
};

// how each kind of knock sounds: gaps between knocks, in seconds
export const KNOCKS = {
  him: [0, 0.9, 1.8],
  polite: [0, 0.22],
  rapid: [0, 0.15, 0.3, 0.45],
  heavy: [0, 0.35, 0.7],
  shave: [0, 0.3, 0.45, 0.6, 0.9, 1.5, 1.75],
};

// friends (bots) reacting
export const FRIENDS = {
  knock: ['Is that him again?', 'Don\'t open it.', 'Somebody check the peephole.', 'He\'s not going to stop, is he?', 'Make it stop...'],
  escalate: ['He\'s going to break the door down!', 'Do something!', 'Just open it, make him go away!', 'The lock won\'t hold!'],
  visitor: ['Who\'s that?', 'Look before you open it.', 'Is it really them?', 'Check their eyes.'],
  open: ['Careful...', 'Oh my god.', 'Close it, close it!'],
  breach: ['HIDE!', 'He\'s inside!', 'The lights!', 'Run!'],
  calm: ['I can\'t believe this is happening.', 'How long until morning?', 'Nobody\'s answering their phones.', 'Should we call someone?', 'At least the view is nice.', 'I\'m never taking the elevator again.'],
  taken: ['No! NO!', 'He took them...', 'Where did he take them?'],
  intro: ['What floor?', 'Fifty, please.', 'Same as us.', 'Come on, come on...', 'Keys. Where are my keys?', 'Lock it! Lock it!'],
};

export const TALK = ['Who is it?', 'What do you want?', 'Go away!'];
