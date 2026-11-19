import { Component } from 'react'
import type { ReactNode, RefObject } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { RoundedBox } from '@react-three/drei/core/RoundedBox.js'
import type { Group } from 'three'
import { useRef } from 'react'
import type { Card } from './engine'
import type { BoardLayout, VisualCard } from './boardLayout'

export function supportsWebGL() {
  try {
    const context = document.createElement('canvas').getContext('webgl2')
    if (!context) return false
    context.getExtension('WEBGL_lose_context')?.loseContext()
    return true
  } catch { return false }
}

export class SceneBoundary extends Component<{ children: ReactNode; onError: () => void }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch() { this.props.onError() }
  render() { return this.state.failed ? null : this.props.children }
}

function Tile({ card, layout, poses, shadows }: {
  card: Card; layout: BoardLayout; poses: RefObject<Record<string, VisualCard>>; shadows: boolean;
}) {
  const ref = useRef<Group>(null)
  const { size, viewport } = useThree()
  useFrame(() => {
    const pose = poses.current[card.id]
    if (!pose || !ref.current) return
    const scale = viewport.width / size.width
    ref.current.position.set((pose.x - layout.width / 2) * scale, (layout.height / 2 - pose.y + 3) * scale, pose.lift * scale)
    ref.current.scale.setScalar(scale)
    ref.current.rotation.set(pose.lift ? .12 : .18, pose.lift ? -.1 : .04, -pose.rotation)
  })
  const geometry: [number, number, number] = [layout.cardWidth, layout.cardHeight, 13]
  return <group ref={ref} scale={0}>
    <RoundedBox args={geometry} radius={12} smoothness={3} castShadow={shadows} receiveShadow={shadows}>
      <meshStandardMaterial color={card.fixed ? '#b9a0ff' : '#ffda67'} roughness={.64} />
    </RoundedBox>
    <RoundedBox args={[geometry[0] - 11, geometry[1] - 11, 3]} position={[0, 0, 7]} radius={9} smoothness={3}>
      <meshStandardMaterial color={card.fixed ? '#e2d4ff' : '#ffe99e'} roughness={.68} />
    </RoundedBox>
  </group>
}

export default function Scene({ cards, layout, poses, quality, report }: {
  cards: Card[]; layout: BoardLayout; poses: RefObject<Record<string, VisualCard>>;
  quality: 'low' | 'medium' | 'high'; report: (exists: boolean) => void;
}) {
  const shadows = quality === 'high'
  return <Canvas
    orthographic camera={{ position: [0, 0, 300], near: .1, far: 1100, zoom: 1 }}
    dpr={quality === 'low' ? 1 : [1, quality === 'high' ? 1.75 : 1.25]}
    shadows={shadows} gl={{ alpha: true, antialias: quality !== 'low', powerPreference: 'low-power' }}
    onCreated={({ gl }) => {
      gl.domElement.addEventListener('webglcontextlost', () => report(false), { once: true })
      report(true)
    }}>
    <ambientLight intensity={1.55} />
    <directionalLight position={[-120, 180, 240]} intensity={2.1} castShadow={shadows}
      shadow-mapSize-width={512} shadow-mapSize-height={512} shadow-camera-left={-450}
      shadow-camera-right={450} shadow-camera-top={260} shadow-camera-bottom={-260} />
    {shadows && <mesh position={[0, 0, -22]} receiveShadow><planeGeometry args={[1800, 1000]} /><shadowMaterial opacity={.3} /></mesh>}
    {cards.map(card => <Tile key={card.id} card={card} layout={layout} poses={poses} shadows={shadows} />)}
  </Canvas>
}
