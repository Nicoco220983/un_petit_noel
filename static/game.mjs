const { assign } = Object
const { abs, floor, min, max, sqrt, cos, sin, atan2, PI, random } = Math

import Two from './two.min.mjs'
import * as utils from './utils.mjs'
const { Group, GameAudio, addTo, urlAbsPath, addToLoads, checkAllLoadsDone, checkHit } = utils

const WIDTH = 800
const HEIGHT = 600
const FPS = 60  // hardcoded in Twojs
const BACKGROUND_COLOR = "#111"

const PLAYGROUND_X_MIN_MAX = [100, 700]
const PLAYGROUND_Y_MIN_MAX = [200, 540]

const scaleGame = nbPlayers => min(1, sqrt(4/(nbPlayers+2)))

const HERO_SIZE = nbPlayers => 60 * scaleGame(nbPlayers)
const HERO_MAX_SPD = (nbPlayers, nbCacthedCadeaux) => 200 * scaleGame(nbPlayers) * (5/(5+nbCacthedCadeaux))
// const HERO_PARALYSIS_DUR = 2

// const MONSTER_SIZE = 80

const CADEAU_THROW_SPEED = 500
const CADEAU_CATCH_PERIOD = .5

const VICTORY_SCORE = nbTeamPlayers => nbTeamPlayers * 20


function startGame(wrapperEl, gameWs) {
  return new Game(wrapperEl, gameWs)
}


class Game extends Two {

  constructor(wrapperEl, gameWs) {
    super({
      type: Two.Types.webgl,
      width: WIDTH,
      height: HEIGHT,
    })
    utils.fitTwoToEl(this, wrapperEl, { background: BACKGROUND_COLOR })

    this.roomId = gameWs.roomId
    this.joypadUrl = gameWs.joypadUrl
    this.joypadUrlQrCode = gameWs.joypadUrlQrCode
    this.sendInput = gameWs.sendInput
    this.sendState = gameWs.sendState

    this.players = {}

    this.sceneGroup = addTo(this, new Group())
    this.setScene(new GameScene(this))
  
    this.bind("update", (frameCount, timeDelta) => {
      const time = frameCount / FPS
      this.mainScene.update(time)
    })
    
    this.play()
  }

  syncPlayers(players) {
    try {
      this.players = players
      this.mainScene.syncPlayers()
    } catch(err) {
      console.log(err)
    }
  }

  onJoypadInput(playerId, kwargs) {
    try {
      this.mainScene.onJoypadInput(playerId, kwargs)
    } catch(err) {
      console.log(err)
    }
  }

  setScene(scn) {
    if(this.mainScene !== undefined) this.mainScene.remove()
    this.mainScene = addTo(this.sceneGroup, scn)
  }
}


// Wallpaper by Kevin MacLeod | https://incompetech.com/
// Music promoted by https://www.chosic.com/free-music/all/
// Creative Commons CC BY 3.0
// https://creativecommons.org/licenses/by/3.0/
const music = addToLoads(new GameAudio(urlAbsPath("assets/Wallpaper.opus"), { volume: .2 }))

const ouchAud = addToLoads(new GameAudio(urlAbsPath("assets/ouch.opus"), { volume: .5 }))
const coinAud = addToLoads(new GameAudio(urlAbsPath("assets/coin.opus"), { volume: 1 }))




class GameScene extends Group {

  constructor(game) {
    super()
    this.game = game

    this.nbPlayers = 0
    this.teamsNbPlayers = [0, 0]
    this.teamsScores = [0, 0]

    this.background = addTo(this, new Group())
    // this.stars = addTo(this, new Group())
    // this.monsters = addTo(this, new Group())
    this.heros = addTo(this, new Group())
    this.cadeaux = addTo(this, new Group())
    this.others = addTo(this, new Group())
    this.notifs = addTo(this, new Group())

    this.addLoadingTexts()
  }

  addLoadingTexts() {
    this.loadingTexts = addTo(this.notifs, new Group())
    addTo(this.loadingTexts, new Two.Text(
      "LOADING...",
      WIDTH / 2, HEIGHT / 2, { fill: "white", size: 20 }
    ))
  }

  checkReady() {
    if(!this.ready && checkAllLoadsDone()) {
      this.ready = true
      this.loadingTexts.remove()
      this.setStep("INTRO")
    }
    return this.ready
  }

  setStep(step) {
    if(!this.ready || step === this.step) return
    this.step = step
    if(step === "INTRO") {
      this.addBackground()
      this.syncPlayers()
      this.addIntroTexts()
      this.mereNoel = addTo(this.others, new MereNoel(this))
      // music.currentTime = 0; music.play({ loop: true })
    } else if(step === "GAME") {
      this.introTexts.remove()
      addTo(this.notifs, new CountDown(3))
      this.mereNoel.nextCadeauTime = this.time + 3
      // this.nextStarTime = this.time + 3
      // this.nextMonsterTime = this.time + 3
      this.scoresPanel = addTo(this.notifs, new ScoresPanel(this))
    } else if(step === "VICTORY") {
      this.addVictoryTexts()
    }
    this.game.sendState({ step })
  }

  update(time) {
    if(!this.checkReady()) return
    this.startTime ||= time
    this.time = time - this.startTime
    const { step } = this
    if(step === "INTRO" || step === "GAME") {
      this.heros.update(this.time)
      // this.checkHerosHerosHit()
    }
    if(step === "GAME") {
      this.cadeaux.update(this.time)
      this.others.update(this.time)
      // this.monsters.update(this.time)
      // this.stars.update(this.time)
      // this.mayAddStar()
      // this.mayAddMonster()
      this.checkHerosCadeauxHit()
      // this.checkHerosMonstersHit()
    }
    this.notifs.update(this.time)
  }

  addBackground() {
    const background = addTo(this.background, new Two.Sprite(
      urlAbsPath("assets/background.jpg"),
      WIDTH / 2, HEIGHT / 2,
    ))
    background.scale = 1
  }

  addIntroTexts() {
    this.introTexts = addTo(this.notifs, new Group())
    const textArgs = { size: 30, fill: "white", alignment: "center" }
    addTo(this.introTexts, new Two.Text(
      "UN PETIT NOEL",
      WIDTH / 2, HEIGHT / 2 - 200,
      { ...textArgs, size: 60, fill: "red", stroke: "white" }
    ))
    addTo(this.introTexts, new Two.Text(
      "Join the game:",
      WIDTH / 2, HEIGHT / 2 - 130,
      { ...textArgs, size: 40 }
    ))
    addTo(this.introTexts, new Two.Sprite(
      new Two.Texture(this.game.joypadUrlQrCode),
      WIDTH / 2, HEIGHT / 2,
    )).scale = 200 / 200
    addTo(this.introTexts, new Two.Text(
      this.game.joypadUrl,
      WIDTH / 2, HEIGHT / 2 + 130,
      textArgs
    ))
  }

  syncPlayers() {
    if(!this.ready) return
    for(const playerId in this.game.players) if(this.step === "INTRO" && !this.getHero(playerId)) this.addHero(playerId)
    for(const hero of this.heros.children) if(!this.game.players[hero.playerId]) this.rmHero(hero.playerId)
    this.nbPlayers = Object.keys(this.game.players).length
  }
  addHero(playerId) {
    addTo(this.heros, new Hero(
      this,
      playerId,
    ))
  }
  getHero(playerId) {
    const res = this.heros.children.filter(h => h.playerId === playerId)
    return res ? res[0] : null
  }
  rmHero(playerId) {
    this.getHero(playerId).remove()
  }

  // mayAddStar() {
  //   if(this.time > this.nextStarTime) {
  //     addTo(this.stars, new Star(this, random() > .5 ? 1 : -1, HEIGHT * random()))
  //     this.nextStarTime = this.time + 1
  //   }
  // }

  // mayAddMonster() {
  //   if(this.time > this.nextMonsterTime) {
  //     addTo(this.monsters, new Monster(random() > .5, HEIGHT * random()))
  //     this.nextMonsterTime = this.time + 5
  //   }
  // }

  checkHerosCadeauxHit() {
    for(const hero of this.heros.children) {
      for(const cadeau of this.cadeaux.children) {
        if(cadeau.step === "waiting" || (cadeau.step === "thrown" && cadeau.thrower !== hero)) {
          if(checkHit(hero, cadeau)) {
            hero.onCadeauHit(cadeau)
            // hero.onStarHit(star)
            // this.scoresPanel.syncScores()
            // if(hero.score >= VICTORY_SCORE) {
            //   this.winnerHero = hero
            //   this.setStep("VICTORY")
            // }
          }
        }
      }
    }
  }

  // checkHerosMonstersHit() {
  //   for(const hero of this.heros.children) {
  //     if(!hero.isParalysed(this.time)) {
  //       for(const monster of this.monsters.children) {
  //         if(checkHit(hero, monster)) {
  //           addTo(this.notifs, new Notif(
  //             "- 1",
  //             hero.translation.x, hero.translation.y,
  //             { fill: "red" }
  //           ))
  //           hero.onMonsterHit(this.time)
  //           this.scoresPanel.syncScores()
  //         }
  //       }
  //     }
  //   }
  // }

  // checkHerosHerosHit() {
  //   const heros = this.heros.children
  //   for(let i=0; i<heros.length; ++i) {
  //     for(let j=i+1; j<heros.length; ++j) {
  //       const hero1 = heros[i], hero2 = heros[j]
  //       if(checkHit(hero1, hero2)) {
  //         hero1.onHeroHit(hero2)
  //         hero2.onHeroHit(hero1)
  //       }
  //     }
  //   }
  // }

  incrScore(team, val) {
    this.teamsScores[team] += val
    this.scoresPanel.syncScores()
    if(this.teamsScores[team] >= VICTORY_SCORE(this.teamsNbPlayers[team])) {
      this.winnerTeam = team
      this.setStep("VICTORY")
    }
  }

  addVictoryTexts() {
    const txtArgs = { fill: "white" }
    this.victoryTexts = addTo(this.notifs, new Group())
    addTo(this.victoryTexts, new Two.Text(
      "VICTORY !",
      WIDTH / 2, HEIGHT / 3,
      { ...txtArgs, size: 80 }
    ))
    addTo(this.victoryTexts, new Two.Text(
      `Winner: ${this.winnerTeam === 0 ? "Team A" : "Team B"}`,
      WIDTH / 2, HEIGHT / 2,
      { ...txtArgs, size: 40 }
    ))
  }

  onJoypadInput(playerId, kwargs) {
    const hero = this.getHero(playerId)
    hero.onJoypadInput(kwargs)
    if(kwargs.ready !== undefined) {
      if(this.step === "INTRO") this.setHeroReady(hero, kwargs.ready)
    }
    if(kwargs.throw) {
      if(this.step === "GAME") hero.tryThrowCadeau()
    }
    if(kwargs.restart) {
      if(this.step === "VICTORY") this.restart()
    }
  }

  setHeroReady(hero, ready) {
    hero.ready = ready
    if(this.step === "INTRO") {
      let allReady = true
      for(const h of this.heros.children) allReady &= h.ready
      if(allReady) this.setStep("GAME")
    }
  }

  restart() {
    this.game.setScene(new GameScene(this.game))
  }

  remove() {
    super.remove()
    music.pause()
  }
}


// const heroCanvasSpec = {
//   standing: [
//     ["shoe", 130, 620, 0],
//     ["body", 170, 400, 0],
//     ["head", 90, 20, 0],
//     ["arm", 290, 430, 0],
//     ["shoe", 200, 630, 0],
//   ],
//   walk: [
//     ["shoe", 130, 620, 0],
//     ["body", 170, 400, 0],
//     ["head", 90, 20, 0],
//     ["arm", 20, 430, PI*1/8],
//     ["shoe", 200, 630, 0],
//   ],
// }


// const heroCanvas = {
//   body: addToLoads(utils.newCanvasFromSrc(urlAbsPath("assets/boy_body.png"))),
//   head: addToLoads(utils.newCanvasFromSrc(urlAbsPath("assets/boy_head.png"))),
//   arm: addToLoads(utils.newCanvasFromSrc(urlAbsPath("assets/boy_arm.png"))),
//   shoe: addToLoads(utils.newCanvasFromSrc(urlAbsPath("assets/boy_shoe.png"))),
//   get: function(color, state, dirX) {
//     const key = `:${color}:${state}:${dirX}`
//     if(!this[key]) {
//       this[key] = utils.newCanvas(500, 750)
//       const ctx = this[key].getContext("2d")
//       for(let spec of heroCanvasSpec[state]) {
//         let img = this[spec[0]], angle = spec[3]
//         if(angle !== 0) img = utils.cloneCanvas(img, { angle })
//         ctx.drawImage(img, spec[1] + (img.dWidth || 0), spec[2] + (img.dHeight || 0))
//       }
//       // utils.colorizeCanvas(this[key], color)
//     }
//     return this[key]
//   }
// }

const heroCanvas = {
  anims: addToLoads(utils.newAnims(urlAbsPath("assets/boy_anims.json"))),
  get: function(color, state, dirX) {
    const key = `:${color}:${state}:${dirX}`
    if(!this[key]) {
      this[key] = this.anims[state].map(can => {
        const can2 = utils.cloneCanvas(can, { flipX: dirX==1 })
        return can2
      })
    }
    return this[key]
  }
}


class Hero extends Group {

  constructor(scn, playerId, x, y) {
    super()
    this.scene = scn
    this.game = scn.game
    this.playerId = playerId
    const player = this.game.players[playerId]
    const { name, color } = player

    const nbHerosTeam0 = this.scene.heros.children.map(h => h.team).filter(t => t === 0).length
    // console.log("TMP nb heros", this.scene.heros.children, (this.scene.heros.children.length / 2), this.scene.heros.children.map(h => h.team).filter(t => t === 0), herosTeam0, herosTeam0.length)
    this.team = (nbHerosTeam0 <= (this.scene.heros.children.length / 2)) ? 0 : 1
    this.scene.teamsNbPlayers[this.team] += 1

    this.translation.x = this.team === 0 ? 
      PLAYGROUND_X_MIN_MAX[0] + random() * ((WIDTH / 2) - PLAYGROUND_X_MIN_MAX[0]) :
      (WIDTH / 2) + random() * (PLAYGROUND_X_MIN_MAX[1] - (WIDTH / 2))
    this.translation.y = PLAYGROUND_Y_MIN_MAX[0] + random() * (PLAYGROUND_Y_MIN_MAX[1] - PLAYGROUND_Y_MIN_MAX[0])
    this.dirX = (this.team === 0 ? 1 : -1)
    // this.dirY = (random() > .5 ? 1 : -1)
    this.spdX = 0
    this.spdY = 0
    this.lastInput = { time: -1 }
    this.catchedCadeaux = []
    this.lastCadeauCatchTime = -CADEAU_CATCH_PERIOD
    // this.paralysisEndTime = 0

    this.standingBodyImgs = {}
    this.walkingBodyImgs = {}
    for(const dirX of [-1, 1]) {
      this.standingBodyImgs[dirX] = addTo(this, new Two.ImageSequence(
        heroCanvas.get(color, "standing", dirX).map(img => new Two.Texture(img)),
        0, 0,
      ))
      this.walkingBodyImgs[dirX] = addTo(this, new Two.ImageSequence(
        heroCanvas.get(color, "walking", dirX).map(img => new Two.Texture(img)),
        0, 0,
        4,
      ))
      this.walkingBodyImgs[dirX].play()
    }
    this.nameText = addTo(this, new Two.Text(
      name,
      0, 0,
      { fill: (this.team === 0 ? "rgb(150,150,255)" : "rgb(255,150,150)"), size: 30 }
    ))

    this.syncSize()
  }

  syncSize() {
    this.width = HERO_SIZE(this.scene.nbPlayers)
    this.height = this.width * 1.5
    for(const dirX of [-1, 1]) {
      if(this.spdX != 0) this.dirX = this.spdX > 0 ? 1 : -1
      this.standingBodyImgs[dirX].visible = (this.dirX * dirX >= 0) && (this.spdX == 0 && this.spdY == 0)
      this.walkingBodyImgs[dirX].visible = (this.dirX * dirX >= 0) && !(this.spdX == 0 && this.spdY == 0)
      this.standingBodyImgs[dirX].scale = this.width / 500
      this.walkingBodyImgs[dirX].scale = this.width / 500
    }
    this.nameText.translation.y = this.height / 2 + 20
  }

  update(time) {
    this.time = time
    this.syncSize()
    // move
    if(time - this.lastInput.time < .2) {
      this.move(this.lastInput.dirX, this.lastInput.dirY)
    } else {
      this.spdX = this.spdY = 0
    }
    if(this.translation.x == PLAYGROUND_X_MIN_MAX[this.team] && this.catchedCadeaux.length > 0) {
      this.scene.incrScore(this.team, this.catchedCadeaux.length)
      for(const cadeau of this.catchedCadeaux) cadeau.remove()
      this.catchedCadeaux.length = 0
    }
    // catched catdeaux
    for(const numCadeau in this.catchedCadeaux) {
      const cadeau = this.catchedCadeaux[numCadeau]
      cadeau.translation.x = this.translation.x + this.dirX * 30
      cadeau.translation.y = this.translation.y - numCadeau * 10
    }
    // if(!this.isParalysed(time)) {
    //   this.visible = true
    //   this.faceImg.index = this.faceNum
    //   const { x, y } = this.translation
    //   const w2 = this.width / 2, h2 = this.height / 2
    //   const { speed, dirX, dirY } = this
    //   this.translation.x += speed * dirX / FPS
    //   this.translation.y += speed * dirY / FPS
    //   if((dirX > 0 && x > WIDTH - w2) || (dirX < 0 && x < w2)) {
    //     this.dirX = -dirX
    //   }
    //   if((dirY > 0 && y > HEIGHT - h2) || (dirY < 0 && y < h2)) {
    //     this.dirY = -dirY
    //   }
    // } else {
    //   this.visible = (time * 4) % 1 > .5
    //   this.faceImg.index = 9
    // }
  }

  move(dirX, dirY) {
    const spd = HERO_MAX_SPD(this.scene.nbPlayers, this.catchedCadeaux.length)
    this.spdX = spd * dirX
    this.spdY = spd * dirY
    this.translation.x = bound(this.translation.x + this.spdX / FPS, PLAYGROUND_X_MIN_MAX[0], PLAYGROUND_X_MIN_MAX[1])
    this.translation.y = bound(this.translation.y + this.spdY / FPS, PLAYGROUND_Y_MIN_MAX[0], PLAYGROUND_Y_MIN_MAX[1])
    // this.moveTime = this.time
  }

  tryThrowCadeau() {
    let first = true
    for(const numCadeau in this.catchedCadeaux) {
      const cadeau = this.catchedCadeaux[numCadeau]
      if(first) {
        first = false
        cadeau.throw(this, this.dirX)
      } else {
        cadeau.fly(-200, 200, -200, 200)
      }
    }
    this.catchedCadeaux.length = 0
  }

  getHitBox() {
    const { width, height } = this
    return {
      left: this.translation.x - width/2,
      top: this.translation.y - height/2,
      width,
      height,
    }
  }

  // onHeroHit(hero2) {
  //   const { x: x1, y: y1 } = this.translation
  //   const { x: x2, y: y2 } = hero2.translation
  //   const hitAngle = atan2(y2 - y1, x2 - x1) / PI
  //   if(hitAngle >= -.25 && hitAngle <= .25) {
  //     this.dirX = -abs(this.dirX)
  //   }
  //   else if(hitAngle > .25 && hitAngle <= .75) {
  //     this.dirY = -abs(this.dirY)
  //   }
  //   else if(hitAngle >= -.75 && hitAngle < -.25) {
  //     this.dirY = abs(this.dirY)
  //   }
  //   else {
  //     this.dirX = abs(this.dirX)
  //   }
  // }

  // onMonsterHit(time) {
  //   this.paralysisEndTime = time + HERO_PARALYSIS_DUR
  //   this.score = max(0, this.score - 1)
  //   ouchAud.replay()
  // }

  // onStarHit(star) {
  //   this.score += 1
  // }

  // isParalysed(time) {
  //   return time < this.paralysisEndTime
  // }

  onJoypadInput(kwargs) {
    if(kwargs.dirX !== undefined) {
      this.lastInput.dirX = kwargs.dirX
      this.lastInput.dirY = kwargs.dirY
      this.lastInput.time = this.time
    }
  }

  onCadeauHit(cadeau) {
    if(cadeau.step === "waiting" && this.time >= this.lastCadeauCatchTime + CADEAU_CATCH_PERIOD) {
      this.catchCadeau(cadeau)
      this.lastCadeauCatchTime = this.time
    }
    if(cadeau.step === "thrown") {
      cadeau.fly(-200, 200, -200, 200)
      for(const cad of this.catchedCadeaux) cad.fly(-200, 200, -200, 200)
      this.catchedCadeaux.length = 0
    }
  }

  catchCadeau(cadeau) {
    this.catchedCadeaux.push(cadeau)
    cadeau.catch(this)
  }
}


class MereNoel extends Two.Sprite {
  constructor(scn) {
    super(
      urlAbsPath("assets/mere_noel.png"),
      WIDTH / 2, HEIGHT / 2
    )
    this.scale = 200 / 500
    this.scene = scn
    this.game = scn.game
    this.nextCadeauTime = 0
  }
  update(time) {
    if(time >= this.nextCadeauTime) {
      this.createCadeaux()
      this.nextCadeauTime = time + 1
    }
  }
  createCadeaux() {
    const nbCadeaux = this.scene.cadeaux.children.length
    const team1NbPlayers = this.scene.teamsNbPlayers[0]
    const team2NbPlayers = this.scene.teamsNbPlayers[1]
    const nbPlayers = team1NbPlayers + team2NbPlayers
    const missingCadeauxTeam1 = (nbPlayers - nbCadeaux) * team1NbPlayers / nbPlayers
    const missingCadeauxTeam2 = (nbPlayers - nbCadeaux) * team2NbPlayers / nbPlayers
    if(missingCadeauxTeam1 > 0) for(let i=0; i<missingCadeauxTeam1; ++i) this.createOneCadeau(0)
    else if(random() < 1/(1-missingCadeauxTeam1)) this.createOneCadeau(0)
    if(missingCadeauxTeam2 > 0) for(let i=0; i<missingCadeauxTeam2; ++i) this.createOneCadeau(1)
    else if(random() < 1/(1-missingCadeauxTeam2)) this.createOneCadeau(1)
  }
  createOneCadeau(team) {
    addTo(this.scene.cadeaux, new Cadeau(this.scene,
      this.translation.x,
      this.translation.y,
      team === 0 ? -200 : 0,
      team === 0 ? 0 : 200,
      -HEIGHT,
      HEIGHT,
    ))
  }
}


const CADEAU_FLY_DUR = .5

const cadeauxTtu = addToLoads(new Two.Texture(urlAbsPath("assets/cadeau.png")))

class Cadeau extends Two.Sprite {
  constructor(scn, x, y, minDx, maxDx, minDy, maxDy) {
    super(cadeauxTtu, x, y)
    this.scale = 50 / 100
    this.scene = scn
    this.game = scn.game
    this.time = 0
    this.fly(minDx, maxDx, minDy, maxDy)
  }
  update(time) {
    if(this.stepUpdate) this.stepUpdate(time)
  }
  fly(minDx, maxDx, minDy, maxDy) {
    this.step = "flying"
    this.flyStartTime = null
    this.orig = { ...this.translation }
    const minX = max(PLAYGROUND_X_MIN_MAX[0], this.translation.x + minDx)
    const maxX = min(PLAYGROUND_X_MIN_MAX[1], this.translation.x + maxDx)
    const targetX = minX + random() * (maxX - minX)
    const minY = max(PLAYGROUND_Y_MIN_MAX[0], this.translation.y + minDy)
    const maxY = min(PLAYGROUND_Y_MIN_MAX[1], this.translation.y + maxDy)
    const targetY = minY + random() * (maxY - minY)
    this.target = { x: targetX, y: targetY }
    this.rotation = 0
    this.stepUpdate = time => {
      this.flyStartTime ||= time
      const flyTime = time - this.flyStartTime
      if(flyTime < CADEAU_FLY_DUR) {
        this.translation.x = this.orig.x + flyTime / CADEAU_FLY_DUR * (this.target.x - this.orig.x)
        this.translation.y = this.orig.y + flyTime / CADEAU_FLY_DUR * (this.target.y - this.orig.y) - sin(flyTime / CADEAU_FLY_DUR * PI) * 50
      } else {
        this.translation.x = this.target.x
        this.translation.y = this.target.y
        this.wait()
      }
    }
  }
  wait() {
    this.step = "waiting"
    this.rotation = 0
    this.stepUpdate = null
  }
  catch(catcher) {
    this.catcher = catcher
    this.step = "catched"
    this.rotation = 0
    this.stepUpdate = null
  }
  throw(thrower, dirX) {
    this.step = "thrown"
    this.thrower = thrower
    this.dirX = dirX
    this.stepUpdate = time => {
      this.rotation += this.dirX * 10 / FPS
      this.translation.x += this.dirX * CADEAU_THROW_SPEED / FPS
      if(this.dirX < 0 && this.translation.x < PLAYGROUND_X_MIN_MAX[0]) this.fly(0, 200, -200, 200)
      else if(this.dirX > 0 && this.translation.x > PLAYGROUND_X_MIN_MAX[1]) this.fly(-200, 0, -200, 200)
    }
  }
}


// class Star extends Two.Sprite {

//   constructor(scn, dir, y) {
//     super(
//       urlAbsPath("assets/star.png"),
//       dir ? WIDTH + 50 : -50, y
//     )
//     this.scene = scn
//     this.game = scn.game

//     this.dir = dir

//     this.syncSize()
//   }

//   syncSize() {
//     this.width = this.height = STAR_SIZE(this.scene.nbPlayers)
//     this.scale = this.width / 100
//     this.speed = STAR_SPEED(this.scene.nbPlayers)
//   }

//   update(time) {
//     this.syncSize()
//     this.translation.x += this.dir * this.speed / FPS
//     if((this.x < -50 && this.dir < 0) || (this.x > WIDTH + 50 && this.dir > 0)) this.remove()
//   }

//   getHitBox() {
//     const width = this.width * .4
//     const height = this.height * .4
//     return {
//       left: this.translation.x - width/2,
//       top: this.translation.y - height/2,
//       width,
//       height,
//     }
//   }

//   onHeroHit(hero) {
//     this.remove()
//     coinAud.replay()
//   }
// }

// class Monster extends Two.Sprite {

//   constructor(dir, y) {
//     super(
//       urlAbsPath("assets/monster.png"),
//       dir ? WIDTH + 50 : -50, y
//     )
//     this.width = this.height = MONSTER_SIZE
//     this.scale = MONSTER_SIZE / 50

//     this.spdX = dir ? -100 : 100
//   }

//   update(time) {
//     this.translation.x += this.spdX / FPS
//     if((this.x < -50 && this.spdX < 0) || (this.x > WIDTH + 50 && this.spdX > 0)) this.remove()
//   }

//   getHitBox() {
//     const width = this.width * .7
//     const height = this.height * .7
//     return {
//       left: this.translation.x - width/2,
//       top: this.translation.y - height/2,
//       width,
//       height,
//     }
//   }
// }


class CountDown extends Group {

  constructor(startVal, next) {
    super()
    this.translation.x = WIDTH / 2
    this.translation.y = HEIGHT / 2
    this.startVal = startVal
    this.val = startVal + 1
    this.next = next
  }

  update(time) {
    super.update(time)
    this.startTime ||= time
    const age = time - this.startTime
    if(age > this.startVal - this.val + 1) {
      this.val -= 1
      this.addNumber()
    }
    if(age > this.startVal) {
      this.remove()
      this.next && this.next()
    }
  }

  addNumber() {
    const number = addTo(this, new Two.Text(this.val, 0, 0, {
      fill: "black", size: 100
    }))
    number.update = function(time) {
      this.startTime ||= time
      const age = time - this.startTime
      this.scale = 1 + age * 6
      if(age > .5) this.remove()
    }
  }
}


class ScoresPanel extends Group {

  constructor(scn) {
    super()
    this.scene = scn
    this.game = scn.game
    // this.heros = scn.heros.children
    // this.nbScores = 2

    this.team1Scores = addTo(this, new Group())
    this.team1Scores.width = 160
    this.team1Scores.height = 40
    this.team1Scores.translation.x = 10
    this.team1Scores.translation.y = 10
    const background1 = addTo(this.team1Scores, new Two.Rectangle(this.team1Scores.width/2, this.team1Scores.height/2, this.team1Scores.width, this.team1Scores.height))
    background1.fill = 'rgba(0, 0, 255, .2)'
    background1.stroke = 'blue'
    this.team1ScoresTxt = addTo(this.team1Scores, new Two.Text(
      "",
      this.team1Scores.width/2, this.team1Scores.height/2 + 2,
      { fill: "white", size: 24 }
    ))

    this.team2Scores = addTo(this, new Group())
    this.team2Scores.width = 160
    this.team2Scores.height = 40
    this.team2Scores.translation.x = WIDTH - 10 - this.team2Scores.width
    this.team2Scores.translation.y = 10
    const background2 = addTo(this.team2Scores, new Two.Rectangle(this.team2Scores.width/2, this.team2Scores.height/2, this.team2Scores.width, this.team2Scores.height))
    background2.fill = 'rgba(255, 0, 0, .2)'
    background2.stroke = 'red'
    this.team2ScoresTxt = addTo(this.team2Scores, new Two.Text(
      "",
      this.team2Scores.width/2, this.team2Scores.height/2 + 2,
      { fill: "white", size: 24 }
    ))

    this.syncScores()
  }

  syncScores() {
    this.team1ScoresTxt.value = `Team A: ${this.scene.teamsScores[0]} / ${VICTORY_SCORE(this.scene.teamsNbPlayers[0])}`
    this.team2ScoresTxt.value = `Team B: ${this.scene.teamsScores[1]} / ${VICTORY_SCORE(this.scene.teamsNbPlayers[1])}`
  }
}


// utils //////////////////////////


function bound(val, minVal, maxVal) {
  return max(min(val, maxVal), minVal)
}

function dist(obj1, obj2) {
  const { x: x1, y: y1 } = obj1
  const { x: x2, y: y2 } = obj2
  const dx = x2-x1, dy = y2-y1
  return sqrt(dx*dx+dy*dy)
}


class Notif extends Two.Text {

  constructor(txt, x, y, textKwargs) {
    super(
      txt, x, y,
      { size: 30, ...textKwargs }
    )
  }

  update(time) {
    this.translation.y -= 50 / FPS
    this.removeTime ||= time + 1
    if(time > this.removeTime) this.remove()
  }
}


export { startGame }
