# Cinder Peak

A co-op, first-person horror game that runs in the browser, in the style of
the slow-burn, everyday-chores-until-it-isn't horror of games like
*Fears to Fathom*. The story, places and characters here are original.

June 2004. You and up to three friends have signed on as volunteer fire
lookouts at Cinder Peak: a glass room on top of a steel tower, in the
middle of a hundred square miles of forest. The lookout before you quit
three weeks into the season. Nobody says why.

It opens with a cutscene: your pickup grinding up the last of the dirt road
at sunset, and Ranger Pruitt handing the place over before he drives away.
Then it's three days and two nights on the mountain:

- **Day one.** Carry the two boxes of supplies up the tower, start the
  generator, check in with dispatch on the radio (they'll give you a code
  word: remember it).
  A hiker comes out of the woods and asks for water. What you tell him
  matters. His old logbook is on the desk.
- **The first night.** Somebody breathing on the radio at two in the
  morning. A flashlight down at the edge of the trees, pointed up at you
  (look through the binoculars). Then the light goes out, there are
  footsteps on the stairs, and knocking under the trapdoor in the floor.
  Bolt it before he gets there, or slam it when he pushes it up.
- **Day two.** Dispatch has a smoke report: find the smoke with the
  binoculars, take a bearing with the fire finder, and radio it in. Pull the
  pictures off the old elk camera by the outhouse. Then a man walks up the
  road and says the ranger sent him. Let him up? Check with dispatch?
- **The second night.** Keep watch, and don't go down alone. The generator
  dies. Somebody calls on the radio who isn't dispatch. He comes up the
  stairs, and then he's on the catwalk, outside the glass.
- **Day three.** The radio's dead. Get off the mountain: drive out in the
  truck (if you still have the keys) or find the one bar of phone signal on
  the catwalk and hold out until help comes.

Anyone caught alone on the ground in the dark is fair game. Bolt the
trapdoor behind you; bolt the door. How it ends depends on what you did.

**Play it:** <https://nickypeakin.github.io/fears-to-fathom/>. It works in Chrome, Edge
or Firefox on a computer with a keyboard and mouse. Headphones help. A full
playthrough takes about half an hour.

## Controls

| Key | Action |
| --- | --- |
| WASD / arrows | walk (Shift to run) |
| Mouse | look |
| E | use, pick up, put down |
| G | drop what you're carrying |
| Right mouse / Z | look through the binoculars (when you're holding them) |
| F | flashlight |
| 1 / 2 / 3 | answer when someone asks you something |
| 1 to 4 | otherwise: shout to your friends |
| P | your phone |
| C | crouch |
| Esc | pause |
| Space (hold) | skip the opening (host only) |

At the fire finder, move the mouse (or A/D) to turn the sight onto the
smoke and press E to mark the bearing.

## Playing with friends

- **Alone:** click **Play Alone**. Everything still works with one player;
  you just do all the jobs yourself.
- **With friends:** one person clicks **Host a Game** and sends the invite
  link from the lobby screen (the **Copy** button). Friends open the link and
  press **Join Game**, or open the game and type the 5-letter code. The host
  clicks **Start** once everyone's in.

There's no game server. The host's browser runs the game, and friends
connect straight to it over WebRTC. The free [PeerJS](https://peerjs.com)
service is only used to find each other by lobby code. The host has to keep
the game open while everyone plays.

If friends can't get in, have everyone press **Test Connection** on the main
menu. Some school and work networks block these connections; the game then
tries public relay servers, and if that fails too, switching either player
to a different network (a phone hotspot works) usually fixes it.

## Publishing to GitHub Pages

`.github/workflows/pages.yml` tests the game, builds it and publishes it on
every push to the default branch. (If Pages isn't switched on yet: in the
repository go to **Settings → Pages → Build and deployment → Source** and
pick **GitHub Actions**.)

## Running it locally

Needs Node.js 20 or newer.

```sh
npm install
npm run dev      # builds dist/ and serves it at http://localhost:8080
npm test         # plays the whole story headless, and walks the tower
```

`?seg=3` in the address starts the story at that part (1 is day one, 6 is
day three), which is handy when changing one part of it.

## How it's built

Plain JavaScript modules and [three.js](https://threejs.org). Every model,
texture and sound is generated in code, so there are no asset files: the
people are sculpted from smooth lofted shapes (faces that blink, hair,
clothes, hands), the mountain is a noise function, the forest is a few
thousand instanced trees (simpler ones further away) on ground painted to
look like forest from above, and every sound is synthesised. Spoken lines
use the browser's own voices (Settings can turn them off; subtitles always
show). The picture renders in HDR with bloom and contrast-adaptive
sharpening, plus an optional old-camcorder look (Settings). It draws at the
screen's full resolution and gives a little of it up only on computers that
can't keep up; Settings → Graphics has a Low option for older laptops. The far distance
is painted into a cube map a face at a time rather than redrawn every frame.

```
public/
  index.html, css/style.css
  js/main.js              menus, lobby and the flow of a game
  js/shared/              rules the host and every client agree on
    config.js             tuning numbers
    story.js              everything anyone says, and how the days go
    layout.js             the tower: surfaces, walls, the trapdoor, where things are
    terrain.js, forest.js the mountain and the trees you can walk between
    items.js              things you can carry
    rng.js
  js/host/                runs in the host's browser (and in Node for tests)
    lobby.js              players joining and leaving, starting games
    match.js              the story: jobs, visits, the radio, the nights, endings
    wade.js               him: walking, climbing, hunting
    timers.js
  js/client/              what each player sees and hears
    game.js               first person: moving, using things, the binoculars,
                          the fire finder, the radio, the phone, the photos
    cutscene.js           the drive up, and the drive out
    world.js              the tower, the cab and the clearing
    land.js, sky.js       the forest, the mountains, the sky through the day
    backdrop.js           the far distance, painted into a cube map
    models.js, props.js   everything else, from the trucks to the stove
    humans.js             procedural people and their animation
    post.js               bloom, tone mapping, the VHS look, the binoculars
    audio.js, voice.js    synthesised sound, spoken lines
    avatar.js, ui.js, net.js, input.js, attract.js, textures.js, util.js
test/
  sim.test.js             the whole story, several ways, 1 to 4 players
  walk.test.js            up and down the tower, the trapdoor, the railings
```

The host decides everything that matters (where Wade is and who he
catches, what dispatch says, what's been done); each client moves its own
character, says what it uses, and draws the rest from the host's snapshots.
