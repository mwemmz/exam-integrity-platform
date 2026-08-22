import { useEffect, useRef } from 'react';

export default function WebcamSnapshot({ attemptId }: { attemptId: number }) {
    const videoRef = useRef<HTMLVideoElement>(null);

    useEffect(() => {
        const startCamera = async () => {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ video: true });
                if (videoRef.current) videoRef.current.srcObject = stream;
            } catch (err) {
                console.error("Camera access denied", err);
            }
        };

        startCamera();

        const interval = setInterval(async () => {
            if (videoRef.current) {
                const canvas = document.createElement('canvas');
                canvas.width = videoRef.current.videoWidth;
                canvas.height = videoRef.current.videoHeight;
                canvas.getContext('2d')?.drawImage(videoRef.current, 0, 0);
                const imageBase64 = canvas.toDataURL('image/jpeg');
                
                await fetch(`/api/snapshots/${attemptId}/snapshot`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ imageBase64 })
                });
            }
        }, 60000); // 60 seconds

        return () => clearInterval(interval);
    }, [attemptId]);

    return <video ref={videoRef} autoPlay playsInline className="hidden" />;
}
