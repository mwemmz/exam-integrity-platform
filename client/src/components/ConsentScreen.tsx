import { useState } from 'react';

export default function ConsentScreen({ onStart }: { examId?: number, onStart: () => void }) {
    const [cameraEnabled, setCameraEnabled] = useState(false);

    const startExam = async () => {
        // Request camera if enabled
        if (cameraEnabled) {
            try {
                await navigator.mediaDevices.getUserMedia({ video: true });
            } catch (e) {
                console.error("Camera denied, continuing without snapshots");
            }
        }
        onStart();
    };

    return (
        <div className="p-10">
            <h1 className="text-2xl font-bold">Exam Consent</h1>
            <p>We monitor tab switches, fullscreen status, and paste actions.</p>
            <label>
                <input type="checkbox" onChange={(e) => setCameraEnabled(e.target.checked)} />
                Enable Webcam Snapshots
            </label>
            <button onClick={startExam} className="bg-blue-500 text-white p-2 mt-4">
                I understand and agree to begin
            </button>
        </div>
    );
}
