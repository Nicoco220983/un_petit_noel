const { min } = Math

import Two from './two.min.mjs'
import * as utils from './utils.mjs'
const { Group, addTo, urlAbsPath, addToLoads, checkAllLoadsDone, checkHit } = utils

const WIDTH = 800
const HEIGHT = 450
const FPS = 60  // hardcoded in Twojs
const BACKGROUND_COLOR = "#111"


function startJoypad(wrapperEl, playerWs) {
  return new Joypad(wrapperEl, playerWs)
}


class Joypad extends Two {

  constructor(wrapperEl, playerWs) {
    super({
      type: Two.Types.webgl,
      width: WIDTH,
      height: HEIGHT,
    })
    utils.fitTwoToEl(this, wrapperEl, { background: BACKGROUND_COLOR })

    this.player = playerWs.player
    this.sendInput = playerWs.sendInput
  
    this.pointer = utils.newPointer(this)

    this.sceneGroup = addTo(this, new Group())
    this.setScene(new JoypadScene(this))
  
    this.pointer.prevIsDown = false
    this.bind("update", (frameCount, timeDelta) => {
      const time = frameCount / FPS
      if(this.pointer.isDown) this.mainScene.click(this.pointer)
      this.mainScene.update(time)
      this.pointer.prevIsDown = this.pointer.isDown
    })

    this.play()
  }

  onGameInput(kwargs) {
    try {
      this.mainScene.onGameInput(kwargs)
    } catch(err) {
      console.log(err)
    }
  }

  onGameState(gameState) {
    this.gameState = gameState
    try {
      this.mainScene.onGameState(gameState)
    } catch(err) {
      console.log(err)
    }
  }
  
  setScene(scn) {
    if(this.mainScene !== undefined) this.mainScene.remove()
    this.mainScene = addTo(this.sceneGroup, scn)
  }
}


class JoypadScene extends Group {

  constructor(joypad) {
    super()
    this.joypad = joypad

    this.buttons = addTo(this, new Group())
    this.notifs = addTo(this, new Group())

    this.addLoadingTexts()
  }

  addLoadingTexts() {
    this.loadingTexts = addTo(this.notifs, new Group())
    addTo(this.loadingTexts, new Two.Text(
      "LOADING...",
      WIDTH / 2, HEIGHT / 2, { fill: "white", size: 50 }
    ))
  }

  chechReady() {
    if(!this.ready && checkAllLoadsDone()) {
      this.ready = true
      this.loadingTexts.visible = false
      this.initSprites()
      const step = this.joypad.gameState ? this.joypad.gameState.step : "WAITING"
      this.setStep(step)
    }
    return this.ready
  }

  initSprites() {
    this.addWaitingTexts()
    this.addArrowButtons()
    this.addReadyButton()
    this.addRestartButton()
  }

  addWaitingTexts() {
    this.waitingTexts = addTo(this.notifs, new Group())
    addTo(this.waitingTexts, new Two.Text(
      "WAITING FOR NEW GAME...",
      WIDTH / 2, HEIGHT / 2, { fill: this.joypad.player.color, size: 40 }
    ))
    this.waitingTexts.visible = false
  }

  addArrowButtons() {
    this.arrowButtons = []
    for(const dir of [0, 1]) {
      const btn = addTo(this.buttons, new ArrowButton(this, dir))
      btn.visible = false
      this.arrowButtons.push(btn)
    }
  }

  addReadyButton() {
    this.readyButton = addTo(this.buttons, new ReadyButton(this, WIDTH/2, 75))
    this.readyButton.visible = false
  }

  addRestartButton() {
    this.restartButton = addTo(this.buttons, new RestartButton(this, WIDTH/2, 75))
    this.restartButton.visible = false
  }

  setStep(step) {
    if(!this.step || this.step === "WAITING") {
      if(step !== "INTRO") step = "WAITING"
    }
    if(!this.ready || step === this.step) return
    this.step = step

    this.waitingTexts.visible = step === "WAITING"
    for(const btn of this.arrowButtons) btn.visible = (step === "INTRO" || step === "GAME" || step === "VICTORY")
    this.readyButton.visible = step === "INTRO"
    this.readyButton.setReady(false)
    this.restartButton.visible = false
    this.timeForRestartButton = null
  }

  update(time) {
    if(!this.chechReady()) return
    super.update(time)
    if(this.step === "VICTORY") {
      this.timeForRestartButton ||= time + 3
      if(time > this.timeForRestartButton) this.restartButton.visible = true
    }
  }

  click(pointer) {
    if(!this.ready) return
    const btns = this.buttons.children
    for(let i=btns.length-1; i>=0; i--) {
      const but = btns[i]
      if(!but.visible) continue
      if(checkHit(pointer, but)) {
        but.click(pointer)
        return
      }
    }
  }

  onGameInput(kwargs) {}

  onGameState(gameState) {
    this.setStep(gameState.step)
  }
}


const arrowCanvas = {
  base: addToLoads(utils.newCanvasFromSrc(urlAbsPath("assets/joypad_arrow.png"))),
  baseClicked: addToLoads(utils.newCanvasFromSrc(urlAbsPath("assets/joypad_arrow_clicked.png"))),
  get: function(dir, clicked, color) {
    const key = `trans:${dir},${clicked}`
    if(!this[key]) {
      const base = clicked ? this.baseClicked : this.base
      this[key] = utils.cloneCanvas(base, { flipX: (dir === 1)})
      if(color) utils.colorizeCanvas(this[key], color)
    }
    return this[key]
  }
}


class ArrowButton extends Two.ImageSequence {
  constructor(scn, dir) {
    super(
      [
        new Two.Texture(arrowCanvas.get(dir, false, scn.joypad.player.color)),
        new Two.Texture(arrowCanvas.get(dir, true, scn.joypad.player.color)),
      ],
      WIDTH / 4 * (dir ? 3 : 1),
      HEIGHT / 2
    )
    this.scale = min(WIDTH / 2, HEIGHT) / 200 * .8
    this.scene = scn
    this.joypad = scn.joypad
    this.dir = dir
    this.lastClickTime = -1
  }
  update(time) {
    this.time = time
    this.index = this.time > this.lastClickTime + .1 ? 0 : 1
  }
  getHitBox() {
    return {
      left: this.dir ? WIDTH / 2 : 0,
      top: 0,
      width: WIDTH / 2,
      height: HEIGHT,
    }
  }
  click(pointer) {
    this.lastClickTime = this.time
    if(!pointer.prevIsDown) this.joypad.sendInput({ dir: this.dir })
  }
}


class ReadyButton extends Two.Sprite {
  constructor(scn, x, y) {
    super(
      urlAbsPath("assets/ready_buttons.png"),
      x, y,
      2, 1,
    )
    this.scale = 250 / 250
    this.scene = scn
    this.joypad = scn.joypad
    this.ready = false
  }
  click(pointer) {
    if(!pointer.prevIsDown) {
      this.setReady(!this.ready)
      this.joypad.sendInput({ ready: this.ready })
    }
  }
  setReady(val) {
    this.ready = val
    this.index = this.ready ? 1 : 0
  }
}


class RestartButton extends Two.Sprite {
  constructor(scn, x, y) {
    super(
      urlAbsPath("assets/restart_button.png"),
      x, y,
    )
    this.scale = 250 / 250
    this.scene = scn
    this.joypad = scn.joypad
  }
  click(pointer) {
    if(!pointer.prevIsDown) {
      this.joypad.sendInput({ restart: true })
    }
  }
}


export { startJoypad }
