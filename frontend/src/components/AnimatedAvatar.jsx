import React, { useState, useEffect, useRef } from 'react';

const AnimatedAvatar = ({ text, isSpeaking }) => {
    const [currentExpression, setCurrentExpression] = useState('neutral');
    const [currentGesture, setCurrentGesture] = useState('idle');
    const [isBlinking, setIsBlinking] = useState(false);
    const [mouthOpenness, setMouthOpenness] = useState(0);
    const blinkIntervalRef = useRef(null);
    const mouthAnimationRef = useRef(null);

    // Version check
    useEffect(() => {
        console.log('🎭 Professional Avatar v2.0 Loaded - With Natural Blinking & Dynamic Lip-Sync');
    }, []);

    // Natural random blinking (every 3-5 seconds)
    useEffect(() => {
        const startBlinking = () => {
            const blink = () => {
                setIsBlinking(true);
                setTimeout(() => setIsBlinking(false), 150); // Quick blink

                // Schedule next blink randomly between 3-5 seconds
                const nextBlinkDelay = 3000 + Math.random() * 2000;
                blinkIntervalRef.current = setTimeout(blink, nextBlinkDelay);
            };

            // Start first blink after 2 seconds
            blinkIntervalRef.current = setTimeout(blink, 2000);
        };

        startBlinking();

        return () => {
            if (blinkIntervalRef.current) {
                clearTimeout(blinkIntervalRef.current);
            }
        };
    }, []);

    // Realistic lip-sync animation
    useEffect(() => {
        if (isSpeaking) {
            let frame = 0;
            const animate = () => {
                // Create natural mouth movement pattern
                const pattern = [0.3, 0.6, 0.4, 0.7, 0.5, 0.8, 0.4, 0.6, 0.3, 0.5];
                setMouthOpenness(pattern[frame % pattern.length]);
                frame++;
                mouthAnimationRef.current = setTimeout(animate, 100); // 10fps for natural speech
            };
            animate();
        } else {
            setMouthOpenness(0);
            if (mouthAnimationRef.current) {
                clearTimeout(mouthAnimationRef.current);
            }
        }

        return () => {
            if (mouthAnimationRef.current) {
                clearTimeout(mouthAnimationRef.current);
            }
        };
    }, [isSpeaking]);

    // Parse cues from text with priority system
    useEffect(() => {
        if (!text) return;

        // Parse all cues
        const smileMatch = text.match(/\[smiles?\s+(warmly|approvingly)\]/i);
        const nodMatch = text.match(/\[nods?\s+slightly\]/i);
        const gestureMatch = text.match(/\[gestures?\s+with\s+hand\]/i);
        const leanMatch = text.match(/\[leans?\s+forward\]/i);

        // Priority 1: Facial Expression (immediate)
        if (smileMatch) {
            setCurrentExpression('smile');
            setTimeout(() => setCurrentExpression('neutral'), 2500);
        }

        // Priority 2: Head Movement (after 300ms)
        if (nodMatch) {
            setTimeout(() => {
                setCurrentGesture('nod');
                setTimeout(() => setCurrentGesture('idle'), 800);
            }, 300);
        }

        // Priority 3: Hand Gesture (after 600ms, only if no other gesture active)
        if (gestureMatch && !nodMatch) {
            setTimeout(() => {
                setCurrentGesture('gesture');
                setTimeout(() => setCurrentGesture('idle'), 1500);
            }, 600);
        }

        // Priority 4: Lean (subtle, can combine with others)
        if (leanMatch) {
            setTimeout(() => {
                setCurrentGesture('lean');
                setTimeout(() => setCurrentGesture('idle'), 2000);
            }, 400);
        }
    }, [text]);

    return (
        <>
            <div className="relative flex flex-col items-center justify-center">
                {/* Avatar Container with smooth transitions */}
                <div className={`relative transition-all duration-700 ease-out ${currentGesture === 'lean' ? 'scale-105' : 'scale-100'
                    } ${currentGesture === 'nod' ? 'avatar-nod' : ''}`}>

                    {/* Outer Professional Glow */}
                    <div className={`absolute inset-0 rounded-full transition-all duration-500 ${isSpeaking
                        ? 'bg-[#5B5BFF]/25 blur-3xl'
                        : 'bg-[#5B5BFF]/10 blur-2xl'
                        }`}></div>

                    {/* Main Avatar Circle - Professional Design */}
                    <div className="relative flex h-56 w-56 items-center justify-center rounded-full bg-gradient-to-br from-[#4263eb]/30 via-[#5B5BFF]/20 to-[#7c3aed]/30 border-[3px] border-[#5B5BFF]/40 shadow-2xl backdrop-blur-sm">

                        {/* Professional Face Structure */}
                        <div className="relative w-40 h-40">
                            {/* Head/Face Base */}
                            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-36 bg-gradient-to-b from-[#5B5BFF]/50 to-[#5B5BFF]/25 rounded-full"></div>

                            {/* Eyes - Natural and Expressive */}
                            <div className="absolute top-10 left-1/2 -translate-x-1/2 flex gap-8">
                                {/* Left Eye */}
                                <div className={`relative transition-all duration-200 ${isBlinking ? 'h-1' : 'h-4'
                                    } w-4 bg-white rounded-full ${currentExpression === 'smile' ? 'scale-90' : 'scale-100'
                                    }`}>
                                    {/* Pupil */}
                                    {!isBlinking && (
                                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 bg-[#1e293b] rounded-full"></div>
                                    )}
                                </div>

                                {/* Right Eye */}
                                <div className={`relative transition-all duration-200 ${isBlinking ? 'h-1' : 'h-4'
                                    } w-4 bg-white rounded-full ${currentExpression === 'smile' ? 'scale-90' : 'scale-100'
                                    }`}>
                                    {/* Pupil */}
                                    {!isBlinking && (
                                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 bg-[#1e293b] rounded-full"></div>
                                    )}
                                </div>
                            </div>

                            {/* Mouth - Realistic Lip-Sync */}
                            <div className="absolute top-20 left-1/2 -translate-x-1/2 transition-all duration-100">
                                {isSpeaking ? (
                                    // Talking - dynamic mouth
                                    <div
                                        className="border-2 border-white rounded-full transition-all duration-100"
                                        style={{
                                            width: `${32 + mouthOpenness * 8}px`,
                                            height: `${12 + mouthOpenness * 8}px`
                                        }}
                                    ></div>
                                ) : currentExpression === 'smile' ? (
                                    // Warm professional smile
                                    <div className="w-12 h-4 border-b-[3px] border-white rounded-b-full"></div>
                                ) : (
                                    // Neutral - calm, closed mouth
                                    <div className="w-8 h-[2px] bg-white/60 rounded-full"></div>
                                )}
                            </div>

                            {/* Subtle Eyebrows for Expression */}
                            <div className="absolute top-8 left-1/2 -translate-x-1/2 flex gap-8">
                                <div className={`w-5 h-[2px] bg-white/40 rounded-full transition-all duration-300 ${currentExpression === 'smile' ? 'rotate-6' : 'rotate-0'
                                    }`}></div>
                                <div className={`w-5 h-[2px] bg-white/40 rounded-full transition-all duration-300 ${currentExpression === 'smile' ? '-rotate-6' : 'rotate-0'
                                    }`}></div>
                            </div>
                        </div>

                        {/* Professional Hand Gesture - Subtle and Natural */}
                        {currentGesture === 'gesture' && (
                            <div className="absolute -right-10 top-1/2 -translate-y-1/2 avatar-wave opacity-80">
                                <div className="w-14 h-20 bg-gradient-to-br from-[#5B5BFF]/50 to-[#7c3aed]/40 rounded-xl rotate-12 shadow-lg"></div>
                            </div>
                        )}
                    </div>

                    {/* Professional Speaking Indicator - Sound Waves */}
                    {isSpeaking && (
                        <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 flex gap-1.5">
                            {[0, 1, 2, 3, 4].map((i) => (
                                <div
                                    key={i}
                                    className="w-1.5 bg-gradient-to-t from-[#5B5BFF] to-[#7c3aed] rounded-full avatar-soundwave shadow-lg"
                                    style={{
                                        height: '20px',
                                        animationDelay: `${i * 0.12}s`
                                    }}
                                ></div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Professional Animation Styles */}
            <style dangerouslySetInnerHTML={{
                __html: `
                    @keyframes avatarNod {
                        0%, 100% { transform: translateY(0) rotate(0deg); }
                        50% { transform: translateY(10px) rotate(2deg); }
                    }
                    @keyframes avatarWave {
                        0%, 100% { transform: rotate(12deg) translateX(0); }
                        25% { transform: rotate(-8deg) translateX(-2px); }
                        75% { transform: rotate(15deg) translateX(2px); }
                    }
                    @keyframes avatarSoundwave {
                        0%, 100% { 
                            height: 12px; 
                            opacity: 0.6; 
                            transform: scaleY(0.6);
                        }
                        50% { 
                            height: 28px; 
                            opacity: 1; 
                            transform: scaleY(1);
                        }
                    }
                    .avatar-nod {
                        animation: avatarNod 0.6s ease-in-out;
                    }
                    .avatar-wave {
                        animation: avatarWave 1.2s ease-in-out infinite;
                    }
                    .avatar-soundwave {
                        animation: avatarSoundwave 0.5s ease-in-out infinite;
                    }
                `
            }} />
        </>
    );
};

export default AnimatedAvatar;
