import React, { useState, useEffect, useRef } from 'react';

const DIDAvatar = ({ text, isSpeaking, onSpeakingComplete }) => {
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
            // Step 1: Create D-ID talk video
            const response = await fetch('https://api.d-id.com/talks', {
                method: 'POST',
                headers: {
                    'Authorization': `Basic ${btoa('YOUR_D-ID_API_KEY')}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    script: {
                        type: 'text',
                        input: inputText,
                        provider: {
                            type: 'microsoft',
                            voice_id: 'en-US-JennyNeural' // Professional female voice
                        }
                    },
                    config: {
                        fluent: true,
                        pad_audio: 0
                    },
                    source_url: 'https://create-images-results.d-id.com/default-presenter-image.jpg' // Default avatar
                })
            });

            const data = await response.json();
            const talkId = data.id;

            // Step 2: Poll for video completion
            let videoReady = false;
            while (!videoReady) {
                await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds

                const statusResponse = await fetch(`https://api.d-id.com/talks/${talkId}`, {
                    headers: {
                        'Authorization': `Basic ${btoa('YOUR_D-ID_API_KEY')}`
                    }
                });

                const statusData = await statusResponse.json();

                if (statusData.status === 'done') {
                    setVideoUrl(statusData.result_url);
                    videoReady = true;
                } else if (statusData.status === 'error') {
                    console.error('Video generation failed:', statusData);
                    break;
                }
            }
        } catch (error) {
            console.error('D-ID API Error:', error);
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
        <div className="relative flex flex-col items-center justify-center">
            {isGenerating ? (
                <div className="flex flex-col items-center gap-4">
                    <div className="h-48 w-48 rounded-full bg-[#5B5BFF]/20 animate-pulse"></div>
                    <p className="text-xs text-white/60">Generating avatar...</p>
                </div>
            ) : videoUrl ? (
                <video
                    ref={videoRef}
                    src={videoUrl}
                    className="h-48 w-48 rounded-full object-cover border-4 border-[#5B5BFF]/30"
                    muted={false}
                />
            ) : (
                <div className="h-48 w-48 rounded-full bg-gradient-to-br from-[#5B5BFF]/20 to-[#8b5cf6]/20 border-2 border-[#5B5BFF]/30 flex items-center justify-center">
                    <p className="text-xs text-white/40">Ready</p>
                </div>
            )}
        </div>
    );
};

export default DIDAvatar;
