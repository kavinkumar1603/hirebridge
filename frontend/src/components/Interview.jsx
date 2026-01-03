import React, { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import axios from 'axios';
import DIDAvatar from './DIDAvatar';
import Feedback from './Feedback';


const Interview = () => {
    const location = useLocation();
    const selectedRole = location.state?.role || 'Software Developer';

    const [messages, setMessages] = useState([]);
    const [isListening, setIsListening] = useState(false);
    const [isThinking, setIsThinking] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [isEvaluating, setIsEvaluating] = useState(false);
    const [evaluation, setEvaluation] = useState(null);
    const [transcript, setTranscript] = useState('');
    const [currentAIMessage, setCurrentAIMessage] = useState('');
    const videoRef = useRef(null);
    const recognitionRef = useRef(null);
    const scrollRef = useRef(null);
    const sessionId = useRef(null);

    // Start or resume interview on mount / role change
    useEffect(() => {
        const startInterview = async () => {
            try {
                const storageKey = 'hirebridge_interview_id';
                const existing = typeof window !== 'undefined'
                    ? window.localStorage.getItem(storageKey)
                    : null;

                const body = {
                    role: selectedRole,
                    interviewId: existing || null,
                };

                const res = await axios.post('/api/questions/start', body);
                const { interviewId, question } = res.data;

                sessionId.current = interviewId;
                if (typeof window !== 'undefined') {
                    window.localStorage.setItem(storageKey, interviewId);
                }

                const openingMsg = {
                    id: Date.now(),
                    role: 'assessor',
                    text: question,
                };
                setMessages([openingMsg]);
                speak(question);
            } catch (error) {
                console.error('Failed to start interview:', error);
                const fallback = 'Welcome to HireBridge. Let’s begin with a quick introduction. Could you briefly walk me through your background for this role?';
                const openingMsg = {
                    id: Date.now(),
                    role: 'assessor',
                    text: fallback,
                };
                setMessages([openingMsg]);
                speak(fallback);
            }
        };

        startInterview();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedRole]);

    // Auto-scroll effect
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, transcript]);

    // Fetch next dynamic question based on last answer
    const fetchNextQuestion = async (lastAnswer = null) => {
        try {
            if (!sessionId.current) {
                return;
            }

            const res = await axios.post('/api/questions/next', {
                interviewId: sessionId.current,
                role: selectedRole,
                lastAnswer,
            });

            const { question } = res.data;
            const aiMsg = {
                id: Date.now(),
                role: 'assessor',
                text: question,
            };

            setMessages(prev => [...prev, aiMsg]);
            speak(question);
        } catch (error) {
            console.error('Failed to fetch next question:', error);
            // Graceful fallback so the UI never crashes
            const fallbackMsg = {
                id: Date.now(),
                role: 'assessor',
                text: 'I’m experiencing a technical issue generating the next question. Let’s pause here for a moment.',
            };
            setMessages(prev => [...prev, fallbackMsg]);
            speak(fallbackMsg.text);
        }
    };

    // Initialize Camera
    useEffect(() => {
        const startVideo = async () => {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                }
            } catch (err) {
                console.error("Error accessing webcam:", err);
            }
        };
        startVideo();

        return () => {
            if (videoRef.current && videoRef.current.srcObject) {
                videoRef.current.srcObject.getTracks().forEach(track => track.stop());
            }
        };
    }, []);

    // Initialize Speech Recognition
    useEffect(() => {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (SpeechRecognition) {
            recognitionRef.current = new SpeechRecognition();
            recognitionRef.current.continuous = true;
            recognitionRef.current.interimResults = true;

            recognitionRef.current.onresult = (event) => {
                let currentTranscript = '';
                for (let i = 0; i < event.results.length; i++) {
                    currentTranscript += event.results[i][0].transcript;
                }
                setTranscript(currentTranscript);
            };

            recognitionRef.current.onend = () => {
                if (isListening) {
                    try {
                        recognitionRef.current.start();
                    } catch (e) {
                        console.log("Recognition restart failed", e);
                    }
                }
            };
        }
    }, [isListening]);

    const toggleListening = async () => {
        if (isListening) {
            recognitionRef.current.stop();
            setIsListening(false);
            if (transcript.trim()) {
                handleUserResponse(transcript);
            }
        } else {
            setTranscript('');
            recognitionRef.current.start();
            setIsListening(true);
        }
    };

    const handleUserResponse = async (text) => {
        setIsThinking(true);
        const userMsg = { id: Date.now(), role: 'user', text };
        setMessages(prev => [...prev, userMsg]);

        try {
            // Pass the latest user answer so the backend (Gemini)
            // can generate an adaptive follow-up question.
            await fetchNextQuestion(text);
        } catch (err) {
            console.error("API Error:", err);
        } finally {
            setIsThinking(false);
            setTranscript('');
        }
    };

    const handleFinishInterview = async () => {
        setIsEvaluating(true);
        if (isListening) recognitionRef.current.stop();

        try {
            if (!sessionId.current) {
                setIsEvaluating(false);
                return;
            }
            const res = await axios.post('/api/evaluate', {
                sessionId: sessionId.current
            });
            setEvaluation(res.data);
        } catch (err) {
            console.error("Evaluation Error:", err);
        } finally {
            setIsEvaluating(false);
        }
    };

    const speak = (text) => {
        // Clean text from animation cues before sending to avatar
        const cleanText = text.replace(/\[.*?\]/g, '').trim();
        setCurrentAIMessage(cleanText);
        setIsSpeaking(true);
    };

    return (
        <div className="relative h-screen w-full overflow-hidden bg-[#0B1020] font-['Inter'] text-white">
            {/* Background with heavy overlay and blur */}
            <div
                className="absolute inset-0 bg-cover bg-center bg-no-repeat scale-110"
                style={{ backgroundImage: "url('/interviewer.png')" }}
            >
                <div className="absolute inset-0 bg-black/80 backdrop-blur-2xl"></div>
            </div>

            {/* Main Content Container */}
            <div className="relative z-10 flex h-full items-center justify-center px-4 lg:px-8">
                {evaluation ? (
                    /* New Professional Feedback Component */
                    <Feedback
                        evaluation={evaluation}
                        onRestart={() => window.location.reload()}
                    />
                ) : (
                    <div className="flex w-full max-w-[1600px] h-[85vh] items-center justify-between gap-6">

                        {/* Left & Center Main Area */}
                        <div className="flex flex-col gap-6 flex-1 h-full justify-center">
                            <div className="flex gap-6 items-center justify-center">

                                {/* Left Panel — Candidate Feed (WEB CAM) */}
                                <div className="relative h-[480px] w-full max-w-[580px] rounded-[32px] border border-white/5 bg-[#121624]/40 shadow-2xl backdrop-blur-3xl animate-fade-in overflow-hidden">
                                    <video
                                        ref={videoRef}
                                        autoPlay
                                        muted
                                        playsInline
                                        className="h-full w-full object-cover"
                                    />
                                    <div className="absolute top-6 left-6 flex flex-col gap-2">
                                        <span className="w-fit rounded-[4px] bg-[#4263eb] px-2 py-0.5 text-[10px] font-bold tracking-tight text-white uppercase">
                                            STUDENT
                                        </span>
                                        <div className="flex items-center gap-2 rounded-full bg-black/40 px-3 py-1.5 border border-white/5 backdrop-blur-md">
                                            <div className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse"></div>
                                            <span className="text-[10px] font-bold tracking-tight text-white/70 uppercase">LIVE FEED</span>
                                        </div>
                                    </div>
                                    {isListening && (
                                        <div className="absolute bottom-6 left-6 right-6">
                                            <div className="bg-black/60 backdrop-blur-md border border-white/10 p-3 rounded-2xl">
                                                <p className="text-xs text-white/60 italic">"{transcript || 'Listening...'}"</p>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Center Panel — AI Assessor View */}
                                <div className="relative h-[480px] w-full max-w-[480px] flex flex-col justify-between rounded-[40px] border border-white/5 bg-[#121624]/40 shadow-2xl backdrop-blur-3xl animate-fade-in [animation-delay:150ms] overflow-hidden">
                                    {/* Realistic D-ID Avatar fills panel */}
                                    <div className="flex-1 w-full">
                                        <DIDAvatar
                                            text={currentAIMessage}
                                            isSpeaking={isSpeaking}
                                            avatarUrl={undefined}
                                            onSpeakingComplete={() => {
                                                setIsSpeaking(false);
                                                setTimeout(() => toggleListening(), 1000);
                                            }}
                                        />
                                    </div>

                                    {/* Status & Branding */}
                                    <div className="flex flex-col items-center gap-1 py-6 bg-gradient-to-t from-black/40 via-black/10 to-transparent">
                                        <div className="flex items-center gap-2 mb-2">
                                            <div className="flex items-end gap-[1px]">
                                                <div className="w-1 h-2 bg-[#5B5BFF] ro`unded-sm animate-bounce" style={{ animationDelay: '0ms' }}></div>
                                                <div className="w-1 h-3 bg-[#5B5BFF] rounded-sm animate-bounce" style={{ animationDelay: '150ms' }}></div>
                                                <div className="w-1 h-1 bg-[#5B5BFF] rounded-sm animate-bounce" style={{ animationDelay: '300ms' }}></div>
                                            </div>
                                            <span className="text-[10px] font-bold tracking-[0.2em] text-white/30 uppercase">LIVE CONNECTION</span>
                                        </div>
                                        <h2 className="text-4xl font-black tracking-tighter text-white/90">LEAD INTERVIEWER</h2>
                                        <span className="text-[11px] font-medium tracking-[0.4em] text-[#5B5BFF] uppercase">
                                            {isSpeaking ? 'TRANSMITTING VOICE...' : 'ELITE ASSESSMENT PROTOCOL'}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Centered Control Bar */}
                            <div className="flex flex-col items-center gap-6 mt-2 animate-fade-in [animation-delay:300ms]">
                                <div className="flex h-[100px] w-[600px] items-center justify-between px-12 rounded-[40px] border border-white/5 bg-[#121624]/60 shadow-2xl backdrop-blur-3xl">
                                    <div className="flex flex-col gap-0.5">
                                        <span className="text-[9px] font-bold tracking-[0.2em] text-white/20 uppercase">MODULE STATE</span>
                                        <span className="text-lg font-bold tracking-tight text-white">
                                            {isThinking ? 'Analyzing...' : isListening ? 'Listening...' : 'Ready'}
                                        </span>
                                    </div>

                                    <div className="flex items-center gap-8">
                                        <div className="relative flex h-20 w-20 items-center justify-center">
                                            {isListening && <div className="absolute inset-0 rounded-full bg-[#5B5BFF]/40 animate-ping"></div>}
                                            <div className={`absolute inset-0 rounded-full bg-[#5B5BFF]/20 ${isListening ? 'animate-pulse' : ''}`}></div>
                                            <button
                                                onClick={toggleListening}
                                                className={`relative z-10 flex h-16 w-16 items-center justify-center rounded-full transition-all duration-300 hover:scale-105 ${isListening ? 'bg-red-500 shadow-[0_0_30px_rgba(239,68,68,0.4)]' : 'bg-[#5B5BFF] shadow-[0_0_30px_rgba(91,91,255,0.4)]'}`}
                                            >
                                                {isListening ? (
                                                    <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-white"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
                                                ) : (
                                                    <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-white"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" x2="12" y1="19" y2="22" /></svg>
                                                )}
                                            </button>
                                        </div>

                                        <button
                                            onClick={handleFinishInterview}
                                            className="px-6 py-3 rounded-full border border-red-500/20 bg-red-500/10 text-red-500 text-[10px] font-bold tracking-widest uppercase hover:bg-red-500 hover:text-white transition-all"
                                        >
                                            Finish Assessment
                                        </button>
                                    </div>

                                    <div className="flex items-center gap-1.5 opacity-40">
                                        {[20, 32, 24, 40, 28].map((h, i) => (
                                            <div key={i} className={`w-1.5 bg-[#5B5BFF] rounded-full ${isListening ? 'animate-bounce' : ''}`} style={{ height: `${h}px`, animationDelay: `${i * 100}ms` }}></div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Right Panel — Conversation Feed */}
                        <div className="flex flex-col h-full w-full max-w-[420px] rounded-[40px] border border-white/5 bg-[#080B14]/80 shadow-2xl backdrop-blur-3xl animate-fade-in [animation-delay:200ms] overflow-hidden">
                            {/* Header */}
                            <div className="p-8 pb-6 border-b border-white/5 bg-[#121624]/20">
                                <div className="flex items-center justify-between mb-1">
                                    <h3 className="text-xs font-bold tracking-[0.1em] text-white uppercase">CONVERSATION FEED</h3>
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white/20"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
                                </div>
                                <span className="text-[10px] font-medium text-[#5B5BFF] uppercase tracking-widest">DIALOGUE INTELLIGENCE</span>
                            </div>

                            {/* Feed Content */}
                            <div
                                ref={scrollRef}
                                className="flex-1 overflow-y-auto p-8 space-y-8 scrollbar-hide scroll-smooth"
                            >
                                {messages.map((msg) => (
                                    <div key={msg.id} className="flex flex-col gap-3">
                                        <span className="text-[9px] font-bold tracking-[0.2em] text-white/20 uppercase px-1">
                                            {msg.role === 'assessor' ? 'ASSESSOR' : 'CANDIDATE'}
                                        </span>
                                        <div className={`rounded-3xl p-6 border border-white/5 backdrop-blur-md shadow-[0_4px_20px_rgba(0,0,0,0.2)] ${msg.role === 'assessor' ? 'bg-white/[0.03]' : 'bg-[#5B5BFF]/10'}`}>
                                            <p className="text-[13px] leading-relaxed text-white/80 font-light">
                                                {msg.text}
                                            </p>
                                        </div>
                                    </div>
                                ))}

                                {/* Live Transcript Bubble */}
                                {isListening && transcript && (
                                    <div className="flex flex-col gap-3 animate-pulse">
                                        <span className="text-[9px] font-bold tracking-[0.2em] text-[#5B5BFF] uppercase px-1">CANDIDATE (TYPING...)</span>
                                        <div className="rounded-3xl p-6 border border-[#5B5BFF]/20 bg-[#5B5BFF]/5 backdrop-blur-md">
                                            <p className="text-[13px] leading-relaxed text-white/60 font-light italic">
                                                "{transcript}"
                                            </p>
                                        </div>
                                    </div>
                                )}

                                {/* Thinking State Indicator */}
                                {isThinking && (
                                    <div className="flex flex-col gap-3">
                                        <span className="text-[9px] font-bold tracking-[0.2em] text-white/20 uppercase px-1">ASSESSOR</span>
                                        <div className="rounded-3xl p-6 bg-white/[0.03] border border-white/5 w-fit">
                                            <div className="flex gap-1">
                                                <div className="w-1.5 h-1.5 bg-[#5B5BFF] rounded-full animate-bounce"></div>
                                                <div className="w-1.5 h-1.5 bg-[#5B5BFF] rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                                                <div className="w-1.5 h-1.5 bg-[#5B5BFF] rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Bottom Label */}
                            <div className="p-8 pt-6 border-t border-white/5 bg-black/40">
                                <span className="block text-center text-[9px] font-bold tracking-[0.2em] text-white/20 uppercase">AI-POWERED CONTEXT EXTRACTION ACTIVE</span>
                            </div>
                        </div>

                    </div>
                )}
            </div>

            {/* Evaluation Loading Overlay */}
            {isEvaluating && (
                <div className="absolute inset-0 z-[100] flex flex-col items-center justify-center bg-black/90 backdrop-blur-md">
                    <div className="w-64 h-1 bg-white/10 rounded-full overflow-hidden mb-6">
                        <div className="w-1/2 h-full bg-[#5B5BFF] animate-progress"></div>
                    </div>
                    <h2 className="text-2xl font-black tracking-tighter mb-2">GENERATING ASSESSMENT</h2>
                    <p className="text-white/40 text-[10px] font-bold tracking-widest uppercase">Analyzing transcript with Gemini 1.5 Pro</p>
                </div>
            )}

            <style dangerouslySetInnerHTML={{
                __html: `
                .scrollbar-hide::-webkit-scrollbar {
                    display: none;
                }
                .scrollbar-hide {
                    -ms-overflow-style: none;
                    scrollbar-width: none;
                }
                @keyframes progress {
                    0% { transform: translateX(-100%); }
                    100% { transform: translateX(200%); }
                }
                .animate-progress {
                    animation: progress 2s infinite ease-in-out;
                }
            `}} />
        </div>
    );
};

export default Interview;

