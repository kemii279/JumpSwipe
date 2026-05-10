<template>
  <canvas ref="canvasRef" class="cyber-click-layer"></canvas>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'

const canvasRef = ref<HTMLCanvasElement | null>(null)
let ctx: CanvasRenderingContext2D | null = null
interface ClickEffect {
  life: number
  update(): void
  draw(ctx: CanvasRenderingContext2D): void
}

let effects: ClickEffect[] = []
let animationFrameId: number | null = null

class Flash {
  x: number
  y: number
  life: number
  radius: number

  constructor(x: number, y: number) {
    this.x = x
    this.y = y
    this.life = 1
    this.radius = 20
  }
  update(): void {
    this.life -= 0.08
    this.radius += 15
  }
  draw(ctx: CanvasRenderingContext2D): void {
    if (this.life <= 0) return
    ctx.globalCompositeOperation = 'lighter'

    const gradient = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.radius)
    gradient.addColorStop(0, `rgba(180, 220, 220, ${this.life})`)
    gradient.addColorStop(0.3, `rgba(0, 220, 220, ${this.life * 0.6})`)
    gradient.addColorStop(1, `rgba(0, 220, 220, 0)`)

    ctx.fillStyle = gradient
    ctx.beginPath()
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2)
    ctx.fill()
  }
}

class Ripple {
  x: number
  y: number
  radius: number
  maxRadius: number
  speed: number
  color: string
  lineWidth: number
  isDashed: boolean
  life: number

  constructor(
    x: number,
    y: number,
    speed: number,
    maxRadius: number,
    color: string,
    lineWidth: number,
    isDashed = false
  ) {
    this.x = x
    this.y = y
    this.radius = 1
    this.maxRadius = maxRadius
    this.speed = speed
    this.color = color
    this.lineWidth = lineWidth
    this.isDashed = isDashed
    this.life = 1
  }
  update(): void {
    this.radius += this.speed
    this.life = Math.max(0, 1 - this.radius / this.maxRadius)
  }
  draw(ctx: CanvasRenderingContext2D): void {
    if (this.life <= 0) return
    ctx.globalCompositeOperation = 'lighter'
    ctx.beginPath()
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2)

    ctx.strokeStyle = `rgba(${this.color}, ${this.life})`
    ctx.lineWidth = this.lineWidth
    ctx.shadowBlur = 15
    ctx.shadowColor = `rgba(${this.color}, ${this.life})`

    if (this.isDashed) {
      const dashLength = Math.random() * 15 + 5
      ctx.setLineDash([dashLength, dashLength * 1.5])
    } else {
      ctx.setLineDash([])
    }

    ctx.stroke()
    ctx.setLineDash([])
    ctx.shadowBlur = 0
  }
}

class Particle {
  x: number
  y: number
  vx: number
  vy: number
  width: number
  height: number
  life: number
  decay: number

  constructor(x: number, y: number) {
    this.x = x
    this.y = y

    const angle = Math.random() * Math.PI * 2
    const speed = Math.random() * 25 + 5
    this.vx = Math.cos(angle) * speed
    this.vy = Math.sin(angle) * speed

    this.width = Math.random() * 2 + 1
    this.height = Math.random() * 30 + 15

    this.life = 1
    this.decay = Math.random() * 0.03 + 0.015
  }
  update(): void {
    this.x += this.vx
    this.y += this.vy

    this.vx *= 0.82
    this.vy *= 0.82
    this.life -= this.decay
  }
  draw(ctx: CanvasRenderingContext2D): void {
    if (this.life <= 0) return

    ctx.globalCompositeOperation = 'source-over'
    ctx.shadowBlur = 10
    ctx.shadowColor = `rgba(0, 255, 255, ${this.life})`

    ctx.fillStyle = `rgba(10, 15, 20, ${this.life})`
    ctx.fillRect(this.x - this.width / 2, this.y - this.height / 2, this.width, this.height)

    ctx.shadowBlur = 0
    ctx.fillStyle = `rgba(0, 0, 0, ${this.life})`
    ctx.fillRect(
      this.x - this.width / 2 + 0.5,
      this.y - this.height / 2 + 0.5,
      Math.max(0.1, this.width - 1),
      this.height - 1
    )
  }
}

function createClickEffect(x: number, y: number): void {
  effects.push(new Flash(x, y))
  effects.push(new Ripple(x, y, 15, 150, '150, 255, 255', 2, true))

  effects.push(new Ripple(x, y, 8, 120, '0, 255, 255', 4, false))
  effects.push(new Ripple(x, y, 3, 80, '0, 150, 255', 8, false))

  const particleCount = Math.floor(Math.random() * 10) + 20
  for (let i = 0; i < particleCount; i++) {
    effects.push(new Particle(x, y))
  }

  if (animationFrameId === null) {
    animate()
  }
}

function resize(): void {
  if (!canvasRef.value) return
  canvasRef.value.width = window.innerWidth
  canvasRef.value.height = window.innerHeight
}

function handleMousedown(e: MouseEvent): void {
  createClickEffect(e.clientX, e.clientY)
}

function handleTouchstart(e: TouchEvent): void {
  for (let i = 0; i < e.touches.length; i++) {
    createClickEffect(e.touches[i].clientX, e.touches[i].clientY)
  }
}

function animate(): void {
  if (!ctx || !canvasRef.value) return

  // アプリ全体の上に重ねるため、真っ黒で塗りつぶすのではなく
  // destination-outで既存の描画の不透明度を下げて残像を作る
  ctx.globalCompositeOperation = 'destination-out'
  ctx.fillStyle = 'rgba(0, 0, 0, 0.25)'
  ctx.fillRect(0, 0, canvasRef.value.width, canvasRef.value.height)

  effects.forEach((effect) => {
    effect.update()
    if (ctx) effect.draw(ctx)
  })

  effects = effects.filter((effect) => effect.life > 0)

  // エフェクトが全て消滅した場合、キャンバスをクリアしてループを停止
  if (effects.length === 0) {
    ctx.clearRect(0, 0, canvasRef.value.width, canvasRef.value.height)
    animationFrameId = null
    return // ループをここで止める
  }

  animationFrameId = requestAnimationFrame(animate)
}

onMounted(() => {
  if (canvasRef.value) {
    ctx = canvasRef.value.getContext('2d')
    resize()
    window.addEventListener('resize', resize)
    // エフェクトを一旦停止
    // window.addEventListener('mousedown', handleMousedown)
    // window.addEventListener('touchstart', handleTouchstart)
    // animate() はクリック時に開始するため、ここでは呼ばない
  }
})

onUnmounted(() => {
  window.removeEventListener('resize', resize)
  window.removeEventListener('mousedown', handleMousedown)
  window.removeEventListener('touchstart', handleTouchstart)
  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId)
  }
})
</script>

<style scoped>
.cyber-click-layer {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  pointer-events: none;
  z-index: 9999;
}
</style>
