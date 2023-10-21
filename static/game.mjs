const { abs, floor, min, max, atan2, PI, random } = Math

import Two from './two.min.mjs'
import * as utils from './utils.mjs'
const { Group, GameAudio, addTo, urlAbsPath, addToLoads, checkAllLoadsDone, checkHit } = utils

const WIDTH = 800
const HEIGHT = 600
const FPS = 60  // hardcoded in Twojs
const BACKGROUND_COLOR = "#111"

const HERO_PARALYSIS_DUR = 2
const VICTORY_SCORE = 20

let game = null


function startGame(wrapperEl, gameWs) {
  game = new Game(wrapperEl, gameWs)
  return game
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

    this.players = {}

    this.sceneGroup = addTo(this, new Group())
    this.setScene(new GameScene())
  
    this.bind("update", (frameCount, timeDelta) => {
      const time = frameCount / FPS
      this._scene.update(time)
    })
    
    this.play()
  }

  syncPlayers(players) {
    try {
      this.players = players
      this._scene.syncPlayers()
    } catch(err) {
      console.log(err)
    }
  }

  onJoypadInput(playerId, kwargs) {
    try {
      this._scene.onJoypadInput(playerId, kwargs)
    } catch(err) {
      console.log(err)
    }
  }

  setScene(scn) {
    if(this._scene !== undefined) this._scene.remove()
    this._scene = addTo(this.sceneGroup, scn)
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

  constructor() {
    super()
    this.notifs = addTo(this, new Group())
    this.background = addTo(this, new Group())
    this.stars = addTo(this, new Group())
    this.monsters = addTo(this, new Group())
    this.heros = addTo(this, new Group())
    this.notifs = addTo(this, new Group())

    this.setStep("LOADING")
  }

  setStep(step) {
    if(step === this.step) return
    this.step = step
    if(step === "LOADING") {
      this.addLoadingTexts()
    } else if(step === "INTRO") {
      this.loadingTexts.remove()
      this.addBackground()
      this.syncPlayers()
      this.addIntroTexts()
      music.play({ loop: true })
    } else if(step === "GAME") {
      this.introTexts.remove()
      addTo(this.notifs, new CountDown(3))
      this.nextStarTime = this.time + 3
      this.nextMonsterTime = this.time + 3
      this.scoresPanel = addTo(this.notifs, new ScoresPanel(this.heros.children))
      game.sendInput({ step: "GAME" })
    } else if(step === "VICTORY") {
      this.addVictoryTexts()
      game.sendInput({ step: "VICTORY" })
    }
  }

  update(time) {
    this.startTime ||= time
    this.time = time - this.startTime
    const { step } = this
    if(step === "LOADING") {
      if(checkAllLoadsDone()) this.setStep("INTRO")
    }
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

  addLoadingTexts() {
    this.loadingTexts = addTo(this.notifs, new Group())
    addTo(this.loadingTexts, new Two.Text(
      "LOADING...",
      WIDTH / 2, HEIGHT / 2, { fill: "white", size: 20 }
    ))
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
      new Two.Texture(game.joypadUrlQrCode),
      WIDTH / 2, HEIGHT / 2,
    )).scale = 200 / 200
    addTo(this.introTexts, new Two.Text(
      game.joypadUrl,
      WIDTH / 2, HEIGHT / 2 + 130,
      textArgs
    ))
  }

  syncPlayers() {
    if(this.step === "LOADING") return
    for(const playerId in game.players) if(!this.getHero(playerId)) this.addHero(playerId)
    for(const hero of this.heros.children) if(!game.players[hero.playerId]) this.rmHero(hero.playerId)
  }
  addHero(playerId) {
    addTo(this.heros, new Hero(
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
      addTo(this.stars, new Star(random() > .5, HEIGHT * random()))
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
    const player = game.players[this.winnerHero.playerId]
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
    game.setScene(new GameScene())
    game.sendInput({ restart: true })
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

  constructor(playerId, x, y) {
    super()
    this.playerId = playerId
    const player = game.players[playerId]
    const { name, color } = player

    this.translation.x = x
    this.translation.y = y
    this.width = this.height = 80
    this.spdX = 200 * (random() > .5 ? 1 : -1)
    this.spdY = 200 * (random() > .5 ? 1 : -1)
    this.score = 0
    this.paralysisEndTime = 0

    const bodyImg = addTo(this, new Two.ImageSequence([
      new Two.Texture(heroBodyCanvas.get(color))
    ], 0, 0))
    bodyImg.scale = 80 / 100
    this.faceImg = addTo(this, new Two.Sprite(
      heroFacesImg,
      0, 0,
      10, 1
    ))
    this.faceImg.scale = 60 / 100
    this.faceImg.index = this.faceNum = floor(random() * 9)

    addTo(this, new Two.Text(
      name,
      0, 60,
      { fill: "black", size: 30 }
    ))
  }

  update(time) {
    if(!this.isParalysed(time)) {
      this.visible = true
      this.faceImg.index = this.faceNum
      this.translation.x += this.spdX / FPS
      this.translation.y += this.spdY/ FPS
      const { x, y } = this.translation
      const { spdX, spdY } = this
      const w2 = this.width / 2, h2 = this.height / 2
      if((spdX > 0 && x > WIDTH - w2) || (spdX < 0 && x < w2)) {
        this.spdX = -spdX
      }
      if((spdY > 0 && y > HEIGHT - h2) || (spdY < 0 && y < h2)) {
        this.spdY = -spdY
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
      this.spdX = -abs(this.spdX)
    }
    else if(hitAngle > .25 && hitAngle <= .75) {
      this.spdY = -abs(this.spdY)
    }
    else if(hitAngle >= -.75 && hitAngle < -.25) {
      this.spdY = abs(this.spdY)
    }
    else {
      this.spdX = abs(this.spdX)
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
      this.spdX = abs(this.spdX) * (kwargs.dir === 0 ? -1 : 1)
    }
  }
}


class Star extends Two.Sprite {

  constructor(dir, y) {
    super(
      urlAbsPath("assets/star.png"),
      dir ? WIDTH + 50 : -50, y
    )
    this.width = this.height = 80
    this.scale = 80 / 100

    this.spdX = dir ? -100 : 100
  }

  update(time) {
    this.translation.x += this.spdX / FPS
    if((this.x < -50 && this.spdX < 0) || (this.x > WIDTH + 50 && this.spdX > 0)) this.remove()
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
    this.width = this.height = 80
    this.scale = 80 / 50

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

  constructor(heros) {
    super()
    this.nbScores = min(10, heros.length)
    this.heros = heros

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
      const p1 = game.players[h1.playerId]
      const p2 = game.players[h1.playerId]
      if(p1.name > p2.name) return -1
      if(p1.name < p2.name) return 1
      return 0
    })
    for(let i=0; i<this.nbScores; ++i) {
      let txt = ""
      if(i < sortedHeros.length) {
        const hero = sortedHeros[i]
        const player = game.players[hero.playerId]
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
