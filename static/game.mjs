const { assign } = Object
const { abs, floor, min, max, sqrt, atan2, PI, random } = Math

import Two from './two.min.mjs'
import * as utils from './utils.mjs'
const { Group, GameAudio, addTo, urlAbsPath, addToLoads, checkAllLoadsDone, checkHit } = utils

const WIDTH = 800
const HEIGHT = 600
const FPS = 60  // hardcoded in Twojs
const BACKGROUND_COLOR = "#111"

const scaleGame = nbPlayers => min(1, sqrt(4/(nbPlayers+2)))

const HERO_SIZE = nbPlayers => 80 * scaleGame(nbPlayers)
const HERO_SPEED = nbPlayers => 200 * scaleGame(nbPlayers)
const HERO_PARALYSIS_DUR = 2

const MONSTER_SIZE = 80

const STAR_SIZE = nbPlayers => 80 * scaleGame(nbPlayers)
const STAR_SPEED = nbPlayers => 100 * scaleGame(nbPlayers)

const VICTORY_SCORE = 20


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

    this.background = addTo(this, new Group())
    this.stars = addTo(this, new Group())
    this.monsters = addTo(this, new Group())
    this.heros = addTo(this, new Group())
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
      music.currentTime = 0; music.play({ loop: true })
    } else if(step === "GAME") {
      this.introTexts.remove()
      addTo(this.notifs, new CountDown(3))
      this.nextStarTime = this.time + 3
      this.nextMonsterTime = this.time + 3
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
      this.checkHerosHerosHit()
    }
    if(step === "GAME") {
      this.monsters.update(this.time)
      this.stars.update(this.time)
      this.mayAddStar()
      this.mayAddMonster()
      this.checkHerosStarsHit()
      this.checkHerosMonstersHit()
    }
    this.notifs.update(this.time)
  }

  addBackground() {
    const background = addTo(this.background, new Two.Sprite(
      urlAbsPath("assets/background.jpg"),
      WIDTH / 2, HEIGHT / 2,
    ))
    background.scale = 2.5
  }

  addIntroTexts() {
    this.introTexts = addTo(this.notifs, new Group())
    const textArgs = { size: 30, fill: "black", alignment: "center" }
    addTo(this.introTexts, new Two.Text(
      "BASIC EXAMPLE",
      WIDTH / 2, HEIGHT / 2 - 200,
      { ...textArgs, size: 60 }
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
      (.25 + .5 * random()) * WIDTH,
      (.25 + .5 * random()) * HEIGHT,
    ))
  }
  getHero(playerId) {
    const res = this.heros.children.filter(h => h.playerId === playerId)
    return res ? res[0] : null
  }
  rmHero(playerId) {
    this.getHero(playerId).remove()
  }

  mayAddStar() {
    if(this.time > this.nextStarTime) {
      addTo(this.stars, new Star(this, random() > .5 ? 1 : -1, HEIGHT * random()))
      this.nextStarTime = this.time + 1
    }
  }

  mayAddMonster() {
    if(this.time > this.nextMonsterTime) {
      addTo(this.monsters, new Monster(random() > .5, HEIGHT * random()))
      this.nextMonsterTime = this.time + 5
    }
  }

  checkHerosStarsHit() {
    for(const hero of this.heros.children) {
      if(!hero.isParalysed(this.time)) {
        for(const star of this.stars.children) {
          if(checkHit(hero, star)) {
            addTo(this.notifs, new Notif(
              (hero.score ? `${hero.score} ` : "") + "+ 1",
              star.translation.x, star.translation.y,
              { fill: "gold" }
            ))
            star.onHeroHit(hero)
            hero.onStarHit(star)
            this.scoresPanel.syncScores()
            if(hero.score >= VICTORY_SCORE) {
              this.winnerHero = hero
              this.setStep("VICTORY")
            }
          }
        }
      }
    }
  }

  checkHerosMonstersHit() {
    for(const hero of this.heros.children) {
      if(!hero.isParalysed(this.time)) {
        for(const monster of this.monsters.children) {
          if(checkHit(hero, monster)) {
            addTo(this.notifs, new Notif(
              "- 1",
              hero.translation.x, hero.translation.y,
              { fill: "red" }
            ))
            hero.onMonsterHit(this.time)
            this.scoresPanel.syncScores()
          }
        }
      }
    }
  }

  checkHerosHerosHit() {
    const heros = this.heros.children
    for(let i=0; i<heros.length; ++i) {
      for(let j=i+1; j<heros.length; ++j) {
        const hero1 = heros[i], hero2 = heros[j]
        if(checkHit(hero1, hero2)) {
          hero1.onHeroHit(hero2)
          hero2.onHeroHit(hero1)
        }
      }
    }
  }

  addVictoryTexts() {
    const player = this.game.players[this.winnerHero.playerId]
    const txtArgs = { fill: "black" }
    this.victoryTexts = addTo(this.notifs, new Group())
    addTo(this.victoryTexts, new Two.Text(
      "VICTORY !",
      WIDTH / 2, HEIGHT / 3,
      { ...txtArgs, size: 80 }
    ))
    addTo(this.victoryTexts, new Two.Text(
      `Winner: ${player.name}`,
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


const heroBodyCanvas = {
  base: addToLoads(utils.newCanvasFromSrc(urlAbsPath("assets/hero_body.png"))),
  get: function(color) {
    const key = `body:${color}`
    if(!this[key]) {
      this[key] = utils.cloneCanvas(this.base)
      utils.colorizeCanvas(this[key], color)
    }
    return this[key]
  }
}
const heroFacesImg = addToLoads(new Two.Texture(urlAbsPath("assets/hero_faces.png")))


class Hero extends Group {

  constructor(scn, playerId, x, y) {
    super()
    this.scene = scn
    this.game = scn.game
    this.playerId = playerId
    const player = this.game.players[playerId]
    const { name, color } = player

    this.translation.x = x
    this.translation.y = y
    this.dirX = (random() > .5 ? 1 : -1)
    this.dirY = (random() > .5 ? 1 : -1)
    this.score = 0
    this.paralysisEndTime = 0

    this.bodyImg = addTo(this, new Two.ImageSequence([
      new Two.Texture(heroBodyCanvas.get(color))
    ], 0, 0))
    this.faceImg = addTo(this, new Two.Sprite(
      heroFacesImg,
      0, 0,
      10, 1
    ))
    this.faceImg.index = this.faceNum = floor(random() * 9)

    this.nameText = addTo(this, new Two.Text(
      name,
      0, 0,
      { fill: "black", size: 30 }
    ))

    this.syncSize()
  }

  syncSize() {
    this.width = this.height = HERO_SIZE(this.scene.nbPlayers)
    this.bodyImg.scale = this.width / 100
    this.faceImg.scale = this.width * .8 / 100
    this.speed = HERO_SPEED(this.scene.nbPlayers)
    this.nameText.translation.y = this.height / 2 + 20
  }

  update(time) {
    this.syncSize()
    if(!this.isParalysed(time)) {
      this.visible = true
      this.faceImg.index = this.faceNum
      const { x, y } = this.translation
      const w2 = this.width / 2, h2 = this.height / 2
      const { speed, dirX, dirY } = this
      this.translation.x += speed * dirX / FPS
      this.translation.y += speed * dirY / FPS
      if((dirX > 0 && x > WIDTH - w2) || (dirX < 0 && x < w2)) {
        this.dirX = -dirX
      }
      if((dirY > 0 && y > HEIGHT - h2) || (dirY < 0 && y < h2)) {
        this.dirY = -dirY
      }
    } else {
      this.visible = (time * 4) % 1 > .5
      this.faceImg.index = 9
    }
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

  onHeroHit(hero2) {
    const { x: x1, y: y1 } = this.translation
    const { x: x2, y: y2 } = hero2.translation
    const hitAngle = atan2(y2 - y1, x2 - x1) / PI
    if(hitAngle >= -.25 && hitAngle <= .25) {
      this.dirX = -abs(this.dirX)
    }
    else if(hitAngle > .25 && hitAngle <= .75) {
      this.dirY = -abs(this.dirY)
    }
    else if(hitAngle >= -.75 && hitAngle < -.25) {
      this.dirY = abs(this.dirY)
    }
    else {
      this.dirX = abs(this.dirX)
    }
  }

  onMonsterHit(time) {
    this.paralysisEndTime = time + HERO_PARALYSIS_DUR
    this.score = max(0, this.score - 1)
    ouchAud.replay()
  }

  onStarHit(star) {
    this.score += 1
  }

  isParalysed(time) {
    return time < this.paralysisEndTime
  }

  onJoypadInput(kwargs) {
    if(kwargs.dir !== undefined) {
      this.dirX = abs(this.dirX) * (kwargs.dir === 0 ? -1 : 1)
    }
  }
}


class Star extends Two.Sprite {

  constructor(scn, dir, y) {
    super(
      urlAbsPath("assets/star.png"),
      dir ? WIDTH + 50 : -50, y
    )
    this.scene = scn
    this.game = scn.game

    this.dir = dir

    this.syncSize()
  }

  syncSize() {
    this.width = this.height = STAR_SIZE(this.scene.nbPlayers)
    this.scale = this.width / 100
    this.speed = STAR_SPEED(this.scene.nbPlayers)
  }

  update(time) {
    this.syncSize()
    this.translation.x += this.dir * this.speed / FPS
    if((this.x < -50 && this.dir < 0) || (this.x > WIDTH + 50 && this.dir > 0)) this.remove()
  }

  getHitBox() {
    const width = this.width * .4
    const height = this.height * .4
    return {
      left: this.translation.x - width/2,
      top: this.translation.y - height/2,
      width,
      height,
    }
  }

  onHeroHit(hero) {
    this.remove()
    coinAud.replay()
  }
}

class Monster extends Two.Sprite {

  constructor(dir, y) {
    super(
      urlAbsPath("assets/monster.png"),
      dir ? WIDTH + 50 : -50, y
    )
    this.width = this.height = MONSTER_SIZE
    this.scale = MONSTER_SIZE / 50

    this.spdX = dir ? -100 : 100
  }

  update(time) {
    this.translation.x += this.spdX / FPS
    if((this.x < -50 && this.spdX < 0) || (this.x > WIDTH + 50 && this.spdX > 0)) this.remove()
  }

  getHitBox() {
    const width = this.width * .7
    const height = this.height * .7
    return {
      left: this.translation.x - width/2,
      top: this.translation.y - height/2,
      width,
      height,
    }
  }
}


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
    this.heros = scn.heros.children
    this.nbScores = min(10, this.heros.length)

    this.translation.x = 10
    this.translation.y = 10
    this.width = 160
    this.height = (this.nbScores) * 25 + 15

    const background = addTo(this, new Two.Rectangle(this.width/2, this.height/2, this.width, this.height))
    background.fill = 'rgba(0, 0, 0, 0.2)'

    this.scoreTexts = addTo(this, new Group())
    for(let i=0; i<this.nbScores; ++i) {
      addTo(this.scoreTexts, new Two.Text(
        "",
        this.width/2, 20 + i * 25,
        { fill: "black", size: 24 }
      ))
    }

    this.syncScores()
  }

  syncScores() {
    const sortedHeros = [...this.heros]
    sortedHeros.sort((h1, h2) => {
      if(h1.score > h2.score) return -1
      if(h1.score < h2.score) return 1
      const p1 = this.game.players[h1.playerId]
      const p2 = this.game.players[h1.playerId]
      if(p1.name > p2.name) return -1
      if(p1.name < p2.name) return 1
      return 0
    })
    for(let i=0; i<this.nbScores; ++i) {
      let txt = ""
      if(i < sortedHeros.length) {
        const hero = sortedHeros[i]
        const player = this.game.players[hero.playerId]
        txt = `${player.name}: ${hero.score}`
      }
      this.scoreTexts.children[i].value = txt
    }
  }
}


// utils //////////////////////////


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
