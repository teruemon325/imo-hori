/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Shovel, Hand, BicepsFlexed, RotateCcw, Trophy, AlertTriangle, Info, Timer, Target, Gem, Zap, Heart, Clock, Star, Volume2, VolumeX } from 'lucide-react';

// --- Sound Manager ---

const soundManager = {
  ctx: null as AudioContext | null,
  isMuted: false,
  
  init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  },

  playSE(type: 'dig' | 'pull' | 'success' | 'fail' | 'gameover', params?: any) {
    if (this.isMuted || !this.ctx) return;
    const now = this.ctx.currentTime;
    
    if (type === 'dig') {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(150 + Math.random() * 100, now);
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(now + 0.05);
    }
    
    if (type === 'pull') {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(200 + (params?.tension || 0) * 3, now);
      gain.gain.setValueAtTime(0.05, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(now + 0.1);
    }

    if (type === 'success') {
      const freqs = [523.25, 659.25, 783.99, 1046.50];
      freqs.forEach((f, i) => {
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();
        osc.frequency.setValueAtTime(f, now + i * 0.1);
        gain.gain.setValueAtTime(0.1, now + i * 0.1);
        gain.gain.exponentialRampToValueAtTime(0.01, now + i * 0.1 + 0.4);
        osc.connect(gain);
        gain.connect(this.ctx!.destination);
        osc.start(now + i * 0.1);
        osc.stop(now + i * 0.1 + 0.4);
      });
    }

    if (type === 'fail') {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(200, now);
      osc.frequency.exponentialRampToValueAtTime(50, now + 0.5);
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.linearRampToValueAtTime(0, now + 0.5);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(now + 0.5);
    }

    if (type === 'gameover') {
      const freqs = [392.00, 349.23, 329.63, 261.63];
      freqs.forEach((f, i) => {
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();
        osc.frequency.setValueAtTime(f, now + i * 0.2);
        gain.gain.setValueAtTime(0.1, now + i * 0.2);
        gain.gain.linearRampToValueAtTime(0, now + i * 0.2 + 0.5);
        osc.connect(gain);
        gain.connect(this.ctx!.destination);
        osc.start(now + i * 0.2);
        osc.stop(now + i * 0.2 + 0.5);
      });
    }
  }
};

// --- Types & Constants ---

type GameState = 'START' | 'PLAYING' | 'SUCCESS' | 'FAILED' | 'GAMEOVER' | 'UPGRADE';

const CANVAS_WIDTH = 320;
const CANVAS_HEIGHT = 480;
const DIRT_GRID_SIZE = 16;

interface Potato {
  x: number;
  y: number;
  width: number;
  height: number;
  type: 'NORMAL' | 'LARGE' | 'KING';
  color: string;
}

interface Rock {
  r: number;
  c: number;
  health: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
}

interface Upgrade {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  effect: () => void;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const SweetPotatoIcon = ({ size = 48, className = "", color = "#9C27B0" }: { size?: number, className?: string, color?: string }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 100 100" 
    className={className}
    fill="none" 
    xmlns="http://www.w3.org/2000/svg"
  >
    <path 
      d="M5,50 C15,30 35,25 50,25 C65,25 85,30 95,50 C85,70 65,75 50,75 C35,75 15,70 5,50 Z" 
      fill={color} 
      stroke="#4A148C" 
      strokeWidth="3"
    />
    <circle cx="40" cy="45" r="3" fill="white" />
    <circle cx="40" cy="45" r="1.5" fill="black" />
    <circle cx="60" cy="45" r="3" fill="white" />
    <circle cx="60" cy="45" r="1.5" fill="black" />
    <path d="M45,55 Q50,62 55,55" stroke="white" strokeWidth="2" fill="none" strokeLinecap="round" />
    <ellipse cx="30" cy="35" rx="10" ry="3" fill="white" fillOpacity="0.2" transform="rotate(-10 30 35)" />
    <circle cx="20" cy="55" r="1" fill="#4A148C" opacity="0.3" />
    <circle cx="80" cy="45" r="1" fill="#4A148C" opacity="0.3" />
    <circle cx="50" cy="65" r="1" fill="#4A148C" opacity="0.3" />
  </svg>
);

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gameState, setGameState] = useState<GameState>('START');
  const [score, setScore] = useState(0);
  const [tension, setTension] = useState(0);
  const [isPulling, setIsPulling] = useState(false);
  const [message, setMessage] = useState('');
  const [timeLeft, setTimeLeft] = useState(60);
  const [harvestCount, setHarvestCount] = useState(0);
  const [level, setLevel] = useState(1);
  
  // Upgrades state
  const [digRadius, setDigRadius] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const bgmIntervalRef = useRef<number | null>(null);

  const playBGM = useCallback(() => {
    soundManager.init();
    if (bgmIntervalRef.current) return;

    const notes = [261.63, 329.63, 392.00, 440.00, 523.25, 440.00, 392.00, 329.63];
    let step = 0;
    bgmIntervalRef.current = window.setInterval(() => {
      if (soundManager.isMuted || !soundManager.ctx) return;
      const now = soundManager.ctx.currentTime;
      const osc = soundManager.ctx.createOscillator();
      const gain = soundManager.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(notes[step % notes.length], now);
      gain.gain.setValueAtTime(0.03, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
      osc.connect(gain);
      gain.connect(soundManager.ctx.destination);
      osc.start();
      osc.stop(now + 0.4);
      step++;
    }, 300);
  }, []);

  const stopBGM = useCallback(() => {
    if (bgmIntervalRef.current) {
      clearInterval(bgmIntervalRef.current);
      bgmIntervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    soundManager.isMuted = isMuted;
  }, [isMuted]);

  useEffect(() => {
    if (gameState === 'PLAYING' || gameState === 'START' || gameState === 'UPGRADE') {
      playBGM();
    } else {
      stopBGM();
    }
    return () => stopBGM();
  }, [gameState, playBGM, stopBGM]);

  useEffect(() => {
    if (gameState === 'GAMEOVER') {
      soundManager.playSE('gameover');
    }
  }, [gameState]);
  const [tensionResistance, setTensionResistance] = useState(1);
  const [pullPower, setPullPower] = useState(4);
  const [availableUpgrades, setAvailableUpgrades] = useState<Upgrade[]>([]);

  const [hasTimeUpgraded, setHasTimeUpgraded] = useState(false);
  const [showQuitConfirm, setShowQuitConfirm] = useState(false);

  // Game state refs
  const dirtRef = useRef<number[][]>([]);
  const rocksRef = useRef<Rock[]>([]);
  const potatoRef = useRef<Potato>({ x: 160, y: 320, width: 60, height: 120, type: 'NORMAL', color: '#A0522D' });
  const mousePosRef = useRef({ x: 0, y: 0, isDown: false });
  const particlesRef = useRef<Particle[]>([]);

  useEffect(() => {
    const preventDefault = (e: TouchEvent) => {
      if (e.touches.length > 1) return; // Allow pinch-zoom if needed, but usually not for games
      e.preventDefault();
    };
    document.addEventListener('touchmove', preventDefault, { passive: false });
    return () => document.removeEventListener('touchmove', preventDefault);
  }, []);

  const initLevel = useCallback((currentLevel: number) => {
    const rows = Math.ceil(CANVAS_HEIGHT / DIRT_GRID_SIZE);
    const cols = Math.ceil(CANVAS_WIDTH / DIRT_GRID_SIZE);
    const grid: number[][] = [];
    for (let r = 0; r < rows; r++) {
      grid[r] = [];
      for (let c = 0; c < cols; c++) {
        if (r > rows / 4) grid[r][c] = 1.0;
        else grid[r][c] = 0;
      }
    }
    dirtRef.current = grid;

    // Determine potato type based on level with some randomness
    let type: Potato['type'] = 'NORMAL';
    const rand = Math.random();
    
    if (currentLevel === 1) {
      // Level 1: Mostly normal, rare large
      type = rand > 0.9 ? 'LARGE' : 'NORMAL';
    } else if (currentLevel === 2) {
      // Level 2: Normal, Large, very rare King
      if (rand > 0.95) type = 'KING';
      else if (rand > 0.6) type = 'LARGE';
      else type = 'NORMAL';
    } else {
      // Level 3+: All types possible, King becomes more common
      const kingChance = Math.min(0.4, 0.1 + (currentLevel * 0.05));
      if (rand < kingChance) type = 'KING';
      else if (rand < 0.6) type = 'LARGE';
      else type = 'NORMAL';
    }

    let w = 60, h = 120, color = '#E91E63'; // Normal: Pinkish-purple
    if (type === 'LARGE') { 
      w = 80; h = 150; color = '#9C27B0'; // Large: Deep purple
    }
    if (type === 'KING') { 
      w = 100; h = 180; color = '#FFD700'; // King: Golden!
    }

    const padding = 40;
    potatoRef.current = {
      x: padding + Math.random() * (CANVAS_WIDTH - padding * 2),
      y: 250 + (Math.random() * 100),
      width: w,
      height: h,
      type,
      color
    };

    const rocks: Rock[] = [];
    const numRocks = Math.floor(currentLevel * 1.2);
    for (let i = 0; i < numRocks; i++) {
      rocks.push({
        r: Math.floor(rows / 2 + Math.random() * (rows / 2)),
        c: Math.floor(Math.random() * cols),
        health: 3.0
      });
    }
    rocksRef.current = rocks;
    particlesRef.current = [];
    setTension(0);
    setIsPulling(false);
  }, []);

  useEffect(() => {
    if (gameState !== 'PLAYING' || showQuitConfirm) return;
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          setGameState('GAMEOVER');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [gameState]);

  // Game Loop
  useEffect(() => {
    if (gameState !== 'PLAYING' || showQuitConfirm) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;

    const update = () => {
      const { x: mx, y: my, isDown } = mousePosRef.current;

      // 1. Digging & Particles
      if (isDown && !isPulling) {
        const r = Math.floor(my / DIRT_GRID_SIZE);
        const c = Math.floor(mx / DIRT_GRID_SIZE);
        
        const rLimit = Math.floor(digRadius);
        for (let dr = -rLimit; dr <= rLimit; dr++) {
          for (let dc = -rLimit; dc <= rLimit; dc++) {
            const nr = r + dr;
            const nc = c + dc;
            if (dirtRef.current[nr] && dirtRef.current[nc] !== undefined) {
              const rock = rocksRef.current.find(rk => rk.r === nr && rk.c === nc);
              if (rock && rock.health > 0) {
                rock.health -= 0.08;
                if (Math.random() > 0.7) soundManager.playSE('dig');
              } else if (dirtRef.current[nr][nc] > 0) {
                dirtRef.current[nr][nc] = Math.max(0, dirtRef.current[nr][nc] - 0.25);
                if (Math.random() > 0.7) soundManager.playSE('dig');
                if (Math.random() > 0.6) {
                  particlesRef.current.push({
                    x: mx + (Math.random() - 0.5) * 15,
                    y: my + (Math.random() - 0.5) * 15,
                    vx: (Math.random() - 0.5) * 5,
                    vy: (Math.random() - 2) * 4,
                    life: 1.0,
                    color: '#795548'
                  });
                }
              }
            }
          }
        }
      }

      // 2. Particles update
      particlesRef.current.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.25;
        p.life -= 0.03;
      });
      particlesRef.current = particlesRef.current.filter(p => p.life > 0);

      // 3. Potato Physics
      const potato = potatoRef.current;
      let stuckness = 0;
      const prStart = Math.floor((potato.y - potato.height / 2) / DIRT_GRID_SIZE);
      const prEnd = Math.floor((potato.y + potato.height / 2) / DIRT_GRID_SIZE);
      const pcStart = Math.floor((potato.x - potato.width / 2) / DIRT_GRID_SIZE);
      const pcEnd = Math.floor((potato.x + potato.width / 2) / DIRT_GRID_SIZE);

      for (let r = prStart; r <= prEnd; r++) {
        for (let c = pcStart; c <= pcEnd; c++) {
          if (dirtRef.current[r] && dirtRef.current[r][c] > 0) stuckness += dirtRef.current[r][c];
          const rock = rocksRef.current.find(rk => rk.r === r && rk.c === c);
          if (rock && rock.health > 0) stuckness += 6; 
        }
      }

      const maxStuck = (prEnd - prStart + 1) * (pcEnd - pcStart + 1);
      const normalizedStuck = Math.min(1, stuckness / (maxStuck * 0.35));

      if (isPulling && isDown) {
        const resistance = normalizedStuck * 7;
        const netForce = pullPower - resistance;
        potato.y -= netForce;

        if (Math.random() > 0.85) soundManager.playSE('pull', { tension });

        if (resistance > 1.2) {
          setTension(prev => Math.min(100, prev + (resistance * 0.5) / tensionResistance));
        } else {
          setTension(prev => Math.max(0, prev - 0.8));
        }
      } else {
        if (potato.y < 280 && normalizedStuck > 0.1) potato.y += 2;
        setTension(prev => Math.max(0, prev - 2));
      }

      draw();

      if (potato.y < 80) {
        setGameState('SUCCESS');
        soundManager.playSE('success');
        const bonus = potato.type === 'KING' ? 500 : potato.type === 'LARGE' ? 200 : 100;
        setScore(prev => prev + Math.floor((100 - tension) + bonus));
        setHarvestCount(prev => prev + 1);
        return;
      }
      
      if (tension >= 100) {
        setGameState('FAILED');
        soundManager.playSE('fail');
        setMessage('ポキッ！おれちゃった...');
        return;
      }

      animationFrameId = requestAnimationFrame(update);
    };

    const draw = () => {
      ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      const timeFactor = timeLeft / 60;
      
      // Sky
      const skyR = Math.floor(lerp(255, 33, timeFactor));
      const skyG = Math.floor(lerp(215, 150, timeFactor));
      const skyB = Math.floor(lerp(0, 243, timeFactor));
      ctx.fillStyle = `rgb(${skyR}, ${skyG}, ${skyB})`;
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      // Sun/Moon
      ctx.fillStyle = timeFactor > 0.3 ? '#FFEB3B' : '#FFF9C4';
      ctx.beginPath();
      ctx.arc(CANVAS_WIDTH - 50, 50, 20, 0, Math.PI * 2);
      ctx.fill();

      // Potato
      const potato = potatoRef.current;
      ctx.save();
      ctx.translate(potato.x, potato.y);
      if (tension > 50) ctx.translate((Math.random() - 0.5) * (tension / 6), (Math.random() - 0.5) * (tension / 6));
      
      // Potato Body
      ctx.fillStyle = '#5D2906';
      ctx.beginPath(); ctx.ellipse(0, 0, potato.width / 2, potato.height / 2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = potato.color;
      ctx.beginPath(); ctx.ellipse(0, 0, potato.width / 2 - 4, potato.height / 2 - 4, 0, 0, Math.PI * 2); ctx.fill();

      // Cute Face
      ctx.fillStyle = 'white';
      ctx.beginPath(); ctx.arc(-10, -10, 6, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(10, -10, 6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'black';
      ctx.beginPath(); ctx.arc(-10, -10, 3, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(10, -10, 3, 0, Math.PI * 2); ctx.fill();
      
      // Mouth
      ctx.strokeStyle = 'black';
      ctx.lineWidth = 2;
      ctx.beginPath();
      if (tension > 60) {
        ctx.arc(0, 15, 8, Math.PI, 0); // Sad/Worried
      } else {
        ctx.arc(0, 5, 8, 0, Math.PI); // Happy
      }
      ctx.stroke();

      ctx.restore();

      // Dirt & Rocks
      const grid = dirtRef.current;
      for (let r = 0; r < grid.length; r++) {
        for (let c = 0; c < grid[r].length; c++) {
          const val = grid[r][c];
          const rock = rocksRef.current.find(rk => rk.r === r && rk.c === c);
          if (rock && rock.health > 0) {
            ctx.fillStyle = `rgba(158, 158, 158, ${rock.health / 3})`;
            ctx.beginPath();
            ctx.roundRect(c * DIRT_GRID_SIZE, r * DIRT_GRID_SIZE, DIRT_GRID_SIZE, DIRT_GRID_SIZE, 4);
            ctx.fill();
          } else if (val > 0) {
            const depthFactor = r / grid.length;
            ctx.fillStyle = `rgba(${Math.floor(lerp(121, 78, depthFactor))}, ${Math.floor(lerp(85, 52, depthFactor))}, ${Math.floor(lerp(72, 46, depthFactor))}, ${val})`;
            ctx.fillRect(c * DIRT_GRID_SIZE, r * DIRT_GRID_SIZE, DIRT_GRID_SIZE, DIRT_GRID_SIZE);
          }
        }
      }

      // Draw Particles
      particlesRef.current.forEach(p => {
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.life;
        ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2); ctx.fill();
      });
      ctx.globalAlpha = 1.0;

      if (!isPulling) {
        ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 3;
        ctx.setLineDash([5, 5]);
        ctx.beginPath(); ctx.arc(mousePosRef.current.x, mousePosRef.current.y, 15 + (digRadius * 4), 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
      }
    };

    update();
    return () => cancelAnimationFrame(animationFrameId);
  }, [gameState, isPulling, tension, timeLeft, digRadius, tensionResistance, pullPower]);

  const handleMouseDown = (e: React.MouseEvent | React.TouchEvent) => {
    if (showQuitConfirm) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = ('touches' in e) ? e.touches[0].clientX - rect.left : (e as React.MouseEvent).clientX - rect.left;
    const y = ('touches' in e) ? e.touches[0].clientY - rect.top : (e as React.MouseEvent).clientY - rect.top;
    mousePosRef.current = { x, y, isDown: true };
    const potato = potatoRef.current;
    if (Math.abs(x - potato.x) < potato.width / 2 && Math.abs(y - potato.y) < potato.height / 2) setIsPulling(true);
  };

  const handleMouseMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (showQuitConfirm) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = ('touches' in e) ? e.touches[0].clientX - rect.left : (e as React.MouseEvent).clientX - rect.left;
    const y = ('touches' in e) ? e.touches[0].clientY - rect.top : (e as React.MouseEvent).clientY - rect.top;
    mousePosRef.current = { ...mousePosRef.current, x, y };
  };

  const handleMouseUp = () => { mousePosRef.current.isDown = false; setIsPulling(false); };

  const startGame = () => {
    soundManager.init();
    setLevel(1); setScore(0); setHarvestCount(0); setTimeLeft(60);
    setDigRadius(1); setTensionResistance(1); setPullPower(4);
    setHasTimeUpgraded(false); setShowQuitConfirm(false);
    initLevel(1); setGameState('PLAYING');
  };

  const prepareUpgrades = () => {
    const pool: Upgrade[] = [
      { id: 'radius', name: 'ひろくほる', description: 'もっとたくさんほれるよ！', icon: <Shovel />, effect: () => setDigRadius(prev => prev + 0.5) },
      { id: 'tension', name: 'やさしい手', description: 'いもがおれにくくなるよ！', icon: <Hand />, effect: () => setTensionResistance(prev => prev + 0.2) },
      { id: 'power', name: 'ちからもち', description: 'ひっぱる力がつよくなるよ！', icon: <BicepsFlexed />, effect: () => setPullPower(prev => prev + 0.4) },
    ];
    
    if (!hasTimeUpgraded) {
      pool.push({ 
        id: 'time', 
        name: 'おひさま', 
        description: 'じかんがふえるよ！', 
        icon: <Clock />, 
        effect: () => {
          setTimeLeft(prev => prev + 10);
          setHasTimeUpgraded(true);
        } 
      });
    }

    const shuffled = [...pool].sort(() => 0.5 - Math.random());
    setAvailableUpgrades(shuffled.slice(0, 3));
    setGameState('UPGRADE');
  };

  const selectUpgrade = (upgrade: Upgrade) => {
    upgrade.effect();
    const nextLvl = level + 1;
    setLevel(nextLvl);
    initLevel(nextLvl);
    setGameState('PLAYING');
  };

  const getRank = (s: number) => {
    if (s >= 10000) return { name: '伝説のいもほり神', color: '#FFB300', desc: '誰も追いつけない伝説の存在！' };
    if (s >= 8000) return { name: 'いもほりキング', color: '#9C27B0', desc: 'あなたこそがおいもの王様！' };
    if (s >= 5000) return { name: 'いもほり職人', color: '#3F51B5', desc: 'すごい！プロ顔負け！' };
    if (s >= 1000) return { name: 'いもほり農家', color: '#2E7D32', desc: 'なかなかの腕前！' };
    return { name: 'みならい農家', color: '#5D4037', desc: 'まだまだこれから！' };
  };

  const rank = getRank(score);

  return (
    <div className="h-[100dvh] w-full bg-[#FFF9C4] font-sans text-[#5D4037] flex flex-col items-center justify-center p-2 overflow-hidden select-none touch-none">
      <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} className="mb-2 text-center relative w-full max-w-[320px]">
        <h1 className="text-3xl font-black mb-1 text-[#FF5722] drop-shadow-sm">おいもほり！</h1>
        <div className="flex gap-4 justify-center text-xs font-bold text-[#795548]">
          <span className="flex items-center gap-1 bg-white/50 px-2 py-0.5 rounded-full">はたけ {level}</span>
          <span className="flex items-center gap-1 bg-white/50 px-2 py-0.5 rounded-full">スコア: {score}</span>
        </div>
        <button 
          onClick={() => setIsMuted(!isMuted)} 
          className="absolute right-0 top-1/2 -translate-y-1/2 bg-white/80 px-3 py-1.5 rounded-full shadow-sm hover:bg-white transition-colors flex items-center gap-1"
        >
          {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
          <span className="text-[9px] font-black whitespace-nowrap">音を{isMuted ? 'だす' : 'けす'}</span>
        </button>
      </motion.div>

      <div className="relative bg-[#8D6E63] rounded-[40px] shadow-2xl overflow-hidden border-[10px] border-[#A1887F]">
        <canvas ref={canvasRef} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp} onTouchStart={handleMouseDown} onTouchMove={handleMouseMove} onTouchEnd={handleMouseUp} className="cursor-none touch-none" />

        {gameState === 'PLAYING' && (
          <div className="absolute top-3 left-3 right-3 pointer-events-none flex flex-col gap-2">
            <div className="flex justify-between items-center">
              <div className="bg-white/90 backdrop-blur-sm px-3 py-1 rounded-full text-[10px] font-black flex items-center gap-1 text-[#FF9800]">
                <Timer size={12} className={timeLeft < 10 ? 'text-red-500 animate-pulse' : ''} />
                <span>あと {timeLeft}びょう</span>
              </div>
              <button 
                onClick={() => setShowQuitConfirm(true)} 
                className="pointer-events-auto bg-white/90 backdrop-blur-sm px-3 py-1 rounded-full text-[10px] font-black text-[#F44336] hover:bg-red-50 active:scale-95 transition-all"
              >
                やめる
              </button>
              <div className="bg-white/90 backdrop-blur-sm px-3 py-1 rounded-full text-[10px] font-black text-[#8BC34A]">
                とった数: {harvestCount}
              </div>
            </div>
            <div className="w-full h-3 bg-black/20 rounded-full overflow-hidden border-2 border-white/50">
              <motion.div className={`h-full ${tension > 70 ? 'bg-[#F44336]' : tension > 40 ? 'bg-[#FF9800]' : 'bg-[#8BC34A]'}`} animate={{ width: `${tension}%` }} />
            </div>
          </div>
        )}

        <AnimatePresence>
          {showQuitConfirm && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center z-50">
              <div className="bg-white p-6 rounded-[40px] shadow-2xl border-4 border-[#F44336] max-w-[260px]">
                <AlertTriangle size={48} className="text-[#F44336] mx-auto mb-4" />
                <h2 className="text-xl font-black mb-2 text-[#F44336]">やめる？</h2>
                <p className="text-xs mb-6 font-bold text-[#795548] leading-relaxed">
                  いままでのスコアが<br/>
                  きえちゃうけど いい？
                </p>
                <div className="flex flex-col gap-3">
                  <button 
                    onClick={() => {
                      setShowQuitConfirm(false);
                      setGameState('START');
                    }} 
                    className="bg-[#F44336] text-white px-6 py-2 rounded-full font-black text-sm shadow-md hover:scale-105 active:scale-95 transition-transform border-b-4 border-[#D32F2F]"
                  >
                    やめる（さいしょにもどる）
                  </button>
                  <button 
                    onClick={() => setShowQuitConfirm(false)} 
                    className="bg-[#8BC34A] text-white px-6 py-2 rounded-full font-black text-sm shadow-md hover:scale-105 active:scale-95 transition-transform border-b-4 border-[#388E3C]"
                  >
                    つづける！
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {gameState === 'START' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-[#FFEB3B]/60 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center">
              <div className="bg-white p-6 rounded-[40px] shadow-2xl border-4 border-[#FF9800]">
                <div className="flex justify-center gap-2 mb-4">
                  <motion.div animate={{ rotate: [0, 10, -10, 0], y: [0, -5, 0] }} transition={{ repeat: Infinity, duration: 2, delay: 0 }}>
                    <SweetPotatoIcon size={50} color="#E91E63" />
                  </motion.div>
                  <motion.div animate={{ rotate: [0, -10, 10, 0], y: [0, -8, 0] }} transition={{ repeat: Infinity, duration: 2.2, delay: 0.2 }}>
                    <SweetPotatoIcon size={64} color="#9C27B0" />
                  </motion.div>
                  <motion.div animate={{ rotate: [0, 10, -10, 0], y: [0, -5, 0] }} transition={{ repeat: Infinity, duration: 2.4, delay: 0.4 }}>
                    <SweetPotatoIcon size={50} color="#FFD700" />
                  </motion.div>
                </div>
                <h2 className="text-2xl font-black mb-2 text-[#FF5722]">おいもをほろう！</h2>
                <p className="text-xs mb-6 font-bold text-[#795548] leading-relaxed">
                  ゆびでつちをほって、<br/>
                  おいもをひっぱろう！<br/>
                  おれないように きをつけてね！
                </p>
                <button onClick={startGame} className="bg-[#FF9800] text-white px-8 py-3 rounded-full font-black text-xl shadow-lg hover:scale-105 active:scale-95 transition-transform border-b-4 border-[#E65100]">
                  あそぶ！
                </button>
              </div>
            </motion.div>
          )}

          {gameState === 'SUCCESS' && (
            <motion.div initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} className="absolute inset-0 bg-white/90 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center">
              <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ repeat: Infinity, duration: 1 }}>
                {potatoRef.current.type === 'KING' ? (
                  <Star size={64} className="text-[#FFD600] mb-4 fill-[#FFF176]" />
                ) : (
                  <Trophy size={64} className="text-[#FFD600] mb-4 fill-[#FFF176]" />
                )}
              </motion.div>
              <h2 className="text-3xl font-black mb-2 text-[#4CAF50]">
                {potatoRef.current.type === 'KING' ? 'すごすぎる！！' : 'やったー！'}
              </h2>
              <p className="text-sm font-bold text-[#795548] mb-6">
                {potatoRef.current.type === 'KING' ? (
                  <span className="text-[#FF9800]">おうごんの キングいもを ゲット！</span>
                ) : potatoRef.current.type === 'LARGE' ? (
                  'おおきないもを ゲットしたよ！'
                ) : (
                  'おいもを ゲットしたよ！'
                )}
              </p>
              <button onClick={prepareUpgrades} className="bg-[#8BC34A] text-white px-8 py-3 rounded-full font-black text-lg shadow-lg border-b-4 border-[#388E3C]">
                つぎへ！
              </button>
            </motion.div>
          )}

          {gameState === 'UPGRADE' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 bg-[#E1F5FE] flex flex-col items-center justify-center p-4 text-center">
              <h2 className="text-2xl font-black mb-6 text-[#0288D1]">どれを つよくする？</h2>
              <div className="grid gap-3 w-full max-w-[240px]">
                {availableUpgrades.map(up => (
                  <button key={up.id} onClick={() => selectUpgrade(up)} className="bg-white p-3 rounded-3xl border-4 border-transparent hover:border-[#03A9F4] shadow-md flex items-center gap-3 text-left active:scale-95 transition-all">
                    <div className="bg-[#03A9F4] text-white p-2 rounded-2xl">{up.icon}</div>
                    <div>
                      <div className="font-black text-xs text-[#01579B]">{up.name}</div>
                      <div className="text-[9px] font-bold text-[#0288D1]">{up.description}</div>
                    </div>
                  </button>
                ))}
              </div>
              <button 
                onClick={() => setShowQuitConfirm(true)} 
                className="mt-8 text-[10px] font-bold text-[#0288D1] underline opacity-60 hover:opacity-100"
              >
                タイトルにもどる
              </button>
            </motion.div>
          )}

          {gameState === 'FAILED' && (
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="absolute inset-0 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-white text-center">
              <AlertTriangle size={64} className="text-[#FF5252] mb-4" />
              <h2 className="text-2xl font-black mb-2">ざんねん...</h2>
              <p className="text-sm font-bold mb-2">{message}</p>
              <p className="text-xs font-bold mb-8 opacity-90">土や石をキレイに、ほってから、おいもをひっぱろう！</p>
              <button onClick={() => { setLevel(l => l + 1); initLevel(level + 1); setGameState('PLAYING'); }} className="bg-white text-[#FF5252] px-8 py-3 rounded-full font-black text-lg shadow-xl">
                つぎこそ！
              </button>
            </motion.div>
          )}

          {gameState === 'GAMEOVER' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 bg-[#FF9800] flex flex-col items-center justify-center p-6 text-white text-center">
              <h2 className="text-4xl font-black mb-4">おしまい！</h2>
              <div className="mb-6 bg-white/90 p-4 rounded-3xl shadow-xl border-2 border-white/50 text-[#5D4037]">
                <div className="text-xs font-bold uppercase tracking-widest mb-1 opacity-60">あなたの かいきゅう</div>
                <div className="text-3xl font-black mb-1 drop-shadow-sm" style={{ color: rank.color }}>{rank.name}</div>
                <div className="text-[10px] font-bold mb-2 opacity-80">{rank.desc}</div>
                <div className="h-px bg-[#5D4037]/10 w-full mb-2" />
                <div className="text-xs font-bold uppercase tracking-widest mb-1 opacity-60">スコア</div>
                <div className="text-5xl font-black text-[#FF9800] drop-shadow-sm">{score}点</div>
              </div>
              <p className="mb-8 font-bold">おいも: {harvestCount}こ</p>
              <button onClick={startGame} className="bg-white text-[#FF9800] px-10 py-4 rounded-full font-black text-xl shadow-2xl border-b-4 border-gray-200">
                もういっかい！
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="mt-4 flex items-center gap-1 text-[10px] font-bold text-[#795548] opacity-60">
        <Info size={10} />
        <span>ヒント: つちをきれいに ほってから ひっぱろう！</span>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @import url('https://fonts.googleapis.com/css2?family=M+PLUS+Rounded+1c:wght@400;700;900&display=swap');
        body { 
          font-family: 'M PLUS Rounded 1c', sans-serif;
          background-color: #FFF9C4;
        }
      `}} />
    </div>
  );
}
