const { min } = Math

import Two from './two.min.mjs'
import * as utils from './utils.mjs'
const { Group, addTo, urlAbsPath, addToLoads, checkAllLoadsDone, checkHit } = utils

const WIDTH = 800
const HEIGHT = 450
const FPS = 60  // hardcoded in Twojs
const BACKGROUND_COLOR = "#111"

let joypad = null


function startJoypad(wrapperEl, playerWs) {
  joypad = new Joypad(wrapperEl, playerWs)
  return joypad
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
    this.setScene(new JoypadScene())
  
    this.pointer.prevIsDown = false
    this.bind("update", (frameCount, timeDelta) => {
      const time = frameCount / FPS
      if(this.pointer.isDown) this._scene.click(this.pointer)
      this._scene.update(time)
      this.pointer.prevIsDown = this.pointer.isDown
    })

    this.play()
  }

  onGameInput(kwargs) {
    try {
      this._scene.onGameInput(kwargs)
    } catch(err) {
      console.log(err)
    }
  }
  
  setScene(scn) {
    if(this._scene !== undefined) this._scene.remove()
    this._scene = addTo(this.sceneGroup, scn)
  }
}


class JoypadScene extends Group {

  constructor() {
    super()
    this.setStep("LOADING")
  }

  setStep(step) {
    if(step === this.step) return
    this.step = step
    if(step === "LOADING") {
      this.loadingTxts = addTo(this, new Group())
      addTo(this.loadingTxts, new Text(
        "LOADING...",
        WIDTH / 2, HEIGHT / 2, { fill: "white", size: 20 }
      ))
    } else if(step === "INTRO") {
      this.loadingTxts.remove()
      this.arrowButtons = addTo(this, new Group())
      addTo(this.arrowButtons, new ArrowButton(0))
      addTo(this.arrowButtons, new ArrowButton(1))
      this.readyButton = addTo(this, new ReadyButton(WIDTH/2, 75))
    } else if(step === "GAME") {
      this.readyButton.remove()
    }
  }

  click(pointer) {
    const { step } = this
    if(step === "INTRO") {
      if(checkHit(pointer, this.readyButton)) {
        this.readyButton.click(pointer)
        return
      }
    }
    if(step === "INTRO" || step === "GAME") {
      for(const button of this.arrowButtons.children) {
        if(checkHit(pointer, button)) button.click(pointer)
      }
    }
    if(step === "VICTORY") {
      if(this.restartButton && checkHit(pointer, this.restartButton)) {
        this.restartButton.click(pointer)
        return
      }
    }
  }

  update(time) {
    super.update(time)
    if(this.step === "LOADING") {
      if(checkAllLoadsDone()) this.setStep("INTRO")
    }
    if(this.step === "VICTORY") {
      this.timeForRestartButton ||= time + 3
      if(!this.restartButton && time > this.timeForRestartButton) {
        this.restartButton = addTo(this, new RestartButton(WIDTH/2, 75))
      }
    }
  }

  onGameInput(kwargs) {
    if(kwargs.step) {
      this.setStep(kwargs.step)
    }
    if(kwargs.restart) {
      this.restart()
    }
  }

  restart() {
    joypad.setScene(new JoypadScene())
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
  constructor(dir) {
    super(
      [
        new Two.Texture(arrowCanvas.get(dir, false, joypad.player.color)),
        new Two.Texture(arrowCanvas.get(dir, true, joypad.player.color)),
      ],
      WIDTH / 4 * (dir ? 3 : 1),
      HEIGHT / 2
    )
    this.scale = min(WIDTH / 2, HEIGHT) / 200 * .8
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
    if(!pointer.prevIsDown) joypad.sendInput({ dir: this.dir })
  }
}


class ReadyButton extends Two.Sprite {
  constructor(x, y) {
    super(
      urlAbsPath("assets/ready_buttons.png"),
      x, y,
      2, 1,
    )
    this.scale = 250 / 250
    this.ready = false
  }
  click(pointer) {
    if(!pointer.prevIsDown) {
      this.ready = !this.ready
      this.index = this.ready ? 1 : 0
      joypad.sendInput({ ready: this.ready })
    }
  }
}


class RestartButton extends Two.Sprite {
  constructor(x, y) {
    super(
      urlAbsPath("assets/restart_button.png"),
      x, y,
    )
    this.scale = 250 / 250
  }
  click(pointer) {
    if(!pointer.prevIsDown) {
      joypad.sendInput({ restart: true })
    }
  }
}


export { startJoypad }
