import React, { useState, useEffect, useRef } from 'react';

const DIDAvatar = ({ text, isSpeaking, onSpeakingComplete, avatarUrl }) => {
    const [videoUrl, setVideoUrl] = useState(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const videoRef = useRef(null);

    useEffect(() => {
        if (text && isSpeaking) {
            generateVideo(text);
        }
    }, [text, isSpeaking]);

    const generateVideo = async (inputText) => {
        setIsGenerating(true);
        try {
            const response = await fetch('http://localhost:8080/api/did/talk', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    scriptText: inputText,
                    avatarUrl: avatarUrl || undefined,
                }),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                console.error('Avatar generation failed:', errorData);
                return;
            }

            const data = await response.json();
            if (data.videoUrl) {
                setVideoUrl(data.videoUrl);
            }
        } catch (error) {
            console.error('Avatar API Error:', error);
        } finally {
            setIsGenerating(false);
        }
    };

    useEffect(() => {
        if (videoUrl && videoRef.current) {
            videoRef.current.play();

            videoRef.current.onended = () => {
                if (onSpeakingComplete) {
                    onSpeakingComplete();
                }
            };
        }
    }, [videoUrl]);

    return (
        <div className="relative w-full h-full">
            {isGenerating && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div className="w-20 h-20 rounded-full bg-[#5B5BFF]/30 animate-pulse mb-3"></div>
                    <p className="text-xs text-white/70 tracking-wide">Preparing interviewer...</p>
                </div>
            )}

            {videoUrl ? (
                <video
                    ref={videoRef}
                    src={videoUrl}
                    className="w-full h-full object-cover"
                    muted={false}
                    controls={false}
                />
            ) : (
                <img
                    src={avatarUrl || '/interviewer_v3.png'}
                    alt="AI Interviewer"
                    className="w-full h-full object-cover"
                />
            )}
        </div>
    );
};

export default DIDAvatar;
