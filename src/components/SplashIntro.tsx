import React, { useState, useEffect } from 'react';

interface SplashIntroProps {
  onComplete: () => void;
  lang?: 'ar' | 'fr';
}

export const SplashIntro: React.FC<SplashIntroProps> = ({ onComplete, lang = 'ar' }) => {
  const [stage, setStage] = useState<'drawing' | 'shining' | 'exit'>('drawing');

  useEffect(() => {
    // Stage 1: Neon drawing (0s - 1.2s)
    const t1 = setTimeout(() => {
      setStage('shining');
    }, 1200);

    // Stage 2: Glow shine & star pop (1.2s - 2.2s)
    const t2 = setTimeout(() => {
      setStage('exit');
    }, 2200);

    // Stage 3: Smooth dissolve to app (2.6s)
    const t3 = setTimeout(() => {
      onComplete();
    }, 2600);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [onComplete]);

  return (
    <div
      className={`fixed inset-0 z-99999 flex flex-col items-center justify-center overflow-hidden transition-all duration-700 select-none ${
        stage === 'exit' ? 'opacity-0 scale-105 pointer-events-none' : 'opacity-100 scale-100'
      }`}
      style={{
        background: 'radial-gradient(circle at 50% 40%, #0d2847 0%, #061527 60%, #030a14 100%)',
      }}
    >
      {/* Background Animated Neon Orbs */}
      <div className="absolute w-[500px] h-[500px] rounded-full bg-cyan-500/15 blur-[120px] pointer-events-none animate-pulse" />
      <div className="absolute w-[350px] h-[350px] rounded-full bg-teal-400/10 blur-[90px] pointer-events-none -bottom-10" />

      {/* Main Animated Logo Container */}
      <div className="relative flex flex-col items-center justify-center">
        {/* Glowing Halo behind the logo */}
        <div
          className={`absolute w-72 h-72 rounded-full bg-cyan-400/20 blur-3xl transition-all duration-1000 ${
            stage === 'shining' ? 'scale-125 opacity-100' : 'scale-90 opacity-40'
          }`}
        />

        {/* SVG Neon Stroke Draw Outline */}
        <div className="relative w-64 h-64 sm:w-72 sm:h-72 flex items-center justify-center">
          {/* Animated SVG Path for the Tooth Silhouette & Smile Arc */}
          <svg
            viewBox="0 0 400 400"
            className="absolute inset-0 w-full h-full z-10 pointer-events-none"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <defs>
              <linearGradient id="neonGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#00e5ff" />
                <stop offset="50%" stopColor="#06b6d4" />
                <stop offset="100%" stopColor="#0ea5e9" />
              </linearGradient>
              <filter id="neonGlow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="6" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {/* Tooth Outline Stroke */}
            <path
              d="M 120 80 C 180 80, 200 130, 260 100 C 300 80, 340 120, 330 170 C 310 250, 280 340, 220 350 C 180 355, 170 300, 150 300 C 130 300, 110 355, 80 340 C 40 320, 30 200, 40 140 C 50 90, 80 80, 120 80 Z"
              stroke="url(#neonGradient)"
              strokeWidth="4"
              strokeLinecap="round"
              filter="url(#neonGlow)"
              className="tooth-draw-path"
            />

            {/* Smile Arc Stroke */}
            <path
              d="M 90 260 Q 200 370, 360 250"
              stroke="#00e5ff"
              strokeWidth="5"
              strokeLinecap="round"
              filter="url(#neonGlow)"
              className="smile-draw-path"
            />
          </svg>

          {/* Actual Logo Image with Shiny Shimmer Effect */}
          <div className="relative z-20 w-56 h-56 sm:w-64 sm:h-64 flex items-center justify-center">
            <img
              src="/logo.png"
              alt="JUST SMILE"
              className={`w-full h-full object-contain filter drop-shadow-[0_10px_25px_rgba(6,182,212,0.4)] transition-all duration-1000 ${
                stage === 'drawing'
                  ? 'opacity-80 scale-95 brightness-110'
                  : 'opacity-100 scale-100 brightness-125'
              }`}
            />

            {/* Shiny Light Sweep Bar */}
            <div
              className={`absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent skew-x-12 pointer-events-none ${
                stage === 'shining' ? 'animate-light-sweep' : 'opacity-0'
              }`}
            />
          </div>

          {/* Top Sparkling Star 1 ✨ */}
          <div
            className={`absolute top-2 left-1/2 -translate-x-1/2 text-cyan-300 transition-all duration-700 ${
              stage === 'shining' ? 'opacity-100 scale-110 rotate-12' : 'opacity-0 scale-0'
            }`}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="#00e5ff" className="filter drop-shadow-[0_0_8px_#00e5ff] animate-pulse">
              <path d="M12 0L14.59 9.41L24 12L14.59 14.59L12 24L9.41 14.59L0 12L9.41 9.41L12 0Z" />
            </svg>
          </div>

          {/* Top Sparkling Star 2 ✨ */}
          <div
            className={`absolute top-8 right-16 text-cyan-200 transition-all duration-700 delay-150 ${
              stage === 'shining' ? 'opacity-100 scale-90 -rotate-12' : 'opacity-0 scale-0'
            }`}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="#38bdf8" className="filter drop-shadow-[0_0_6px_#38bdf8]">
              <path d="M12 0L14.59 9.41L24 12L14.59 14.59L12 24L9.41 14.59L0 12L9.41 9.41L12 0Z" />
            </svg>
          </div>

          {/* Right Sparkling Star 3 ✨ */}
          <div
            className={`absolute bottom-12 right-2 text-cyan-300 transition-all duration-700 delay-300 ${
              stage === 'shining' ? 'opacity-100 scale-100 rotate-45' : 'opacity-0 scale-0'
            }`}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="#00e5ff" className="filter drop-shadow-[0_0_8px_#00e5ff] animate-spin-slow">
              <path d="M12 0L14.59 9.41L24 12L14.59 14.59L12 24L9.41 14.59L0 12L9.41 9.41L12 0Z" />
            </svg>
          </div>
        </div>

        {/* Brand Name & Tagline */}
        <div className="text-center mt-6 space-y-1.5 z-20">
          <h2 className="text-2xl sm:text-3xl font-black tracking-wider text-white flex items-center justify-center gap-2">
            <span className="bg-gradient-to-r from-white via-cyan-100 to-cyan-400 bg-clip-text text-transparent">
              JUST SMILE
            </span>
          </h2>
          <p className="text-xs sm:text-sm font-extrabold text-cyan-400/90 tracking-widest uppercase">
            Dental Supplies B2B
          </p>
        </div>

        {/* Animated Progress Bar */}
        <div className="mt-8 w-44 h-1.5 bg-slate-800/80 rounded-full overflow-hidden border border-cyan-500/20 relative z-20 shadow-inner">
          <div
            className="h-full bg-gradient-to-r from-cyan-400 via-teal-300 to-cyan-500 rounded-full transition-all duration-1000 ease-out shadow-[0_0_12px_#06b6d4]"
            style={{
              width: stage === 'drawing' ? '45%' : stage === 'shining' ? '90%' : '100%',
            }}
          />
        </div>

        {/* Skip button for quick navigation */}
        <button
          type="button"
          onClick={onComplete}
          className="mt-6 text-[11px] font-bold text-slate-400 hover:text-cyan-300 transition-colors z-20 px-3 py-1 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 cursor-pointer"
        >
          {lang === 'fr' ? 'Passer ✕' : 'تخطي ✕'}
        </button>
      </div>

      <style>{`
        .tooth-draw-path {
          stroke-dasharray: 1200;
          stroke-dashoffset: 1200;
          animation: drawTooth 1.4s cubic-bezier(0.65, 0, 0.35, 1) forwards;
        }
        .smile-draw-path {
          stroke-dasharray: 600;
          stroke-dashoffset: 600;
          animation: drawSmile 1s cubic-bezier(0.65, 0, 0.35, 1) 0.4s forwards;
        }
        @keyframes drawTooth {
          0% { stroke-dashoffset: 1200; opacity: 0; }
          20% { opacity: 1; }
          100% { stroke-dashoffset: 0; opacity: 0.9; }
        }
        @keyframes drawSmile {
          0% { stroke-dashoffset: 600; opacity: 0; }
          20% { opacity: 1; }
          100% { stroke-dashoffset: 0; opacity: 1; }
        }
        @keyframes lightSweep {
          0% { transform: translateX(-150%) skewX(-20deg); }
          100% { transform: translateX(200%) skewX(-20deg); }
        }
        .animate-light-sweep {
          animation: lightSweep 0.9s cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
        }
        @keyframes spinSlow {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        .animate-spin-slow {
          animation: spinSlow 8s linear infinite;
        }
      `}</style>
    </div>
  );
};

export default SplashIntro;
