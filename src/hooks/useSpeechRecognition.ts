import { useState, useCallback, useRef, useEffect } from 'react';

interface SpeechRecognitionResult {
  transcript: string;
  isListening: boolean;
  error: string | null;
  startListening: () => void;
  stopListening: () => void;
  resetTranscript: () => void;
  supported: boolean;
}

interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionResultList {
  length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  isFinal: boolean;
  [index: number]: {
    transcript: string;
    confidence: number;
  };
  length: number;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message: string;
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition;
    webkitSpeechRecognition: new () => SpeechRecognition;
  }
}

export function useSpeechRecognition(): SpeechRecognitionResult {
  const [transcript, setTranscript] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [supported, setSupported] = useState(true);

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const finalTranscriptRef = useRef('');
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const usingFallbackRef = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined') {
      setSupported(false);
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      console.log('Web Speech API not available, will use recording fallback');
      usingFallbackRef.current = true;
      setSupported(true);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsListening(true);
      setError(null);
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interimTranscript = '';
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const t = result[0]?.transcript || '';
        if (result.isFinal) {
          finalTranscript += t;
        } else {
          interimTranscript += t;
        }
      }

      if (finalTranscript) {
        finalTranscriptRef.current += finalTranscript;
      }

      setTranscript(finalTranscriptRef.current + interimTranscript);
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error('Speech recognition error:', event.error);

      if (event.error === 'not-allowed') {
        setError('Microphone access denied. Please allow microphone permissions in your browser settings.');
        setIsListening(false);
      } else if (event.error === 'no-speech') {
        setError('No speech detected. Please try speaking again.');
        setIsListening(false);
      } else if (event.error === 'network') {
        console.log('Web Speech API blocked, switching to Deepgram recording fallback');
        usingFallbackRef.current = true;
        setError(null);
        setIsListening(false);
        startFallbackRecording();
      } else if (event.error === 'aborted') {
        setError(null);
        setIsListening(false);
      } else {
        setError(`Speech recognition error: ${event.error}`);
        setIsListening(false);
      }
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;

    return () => {
      recognition.abort();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startFallbackRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(track => track.stop());

        if (audioChunksRef.current.length === 0) {
          setIsListening(false);
          return;
        }

        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });

        try {
          setError(null);
          const formData = new FormData();
          formData.append('audio', audioBlob, 'recording.webm');

          const response = await fetch('/api/transcribe', {
            method: 'POST',
            body: formData,
          });

          const data = await response.json();
          if (data.success && data.text) {
            finalTranscriptRef.current = data.text;
            setTranscript(data.text);
          } else {
            setError(data.error || 'Failed to transcribe audio.');
          }
        } catch (err) {
          console.error('Transcription error:', err);
          setError('Failed to transcribe audio. Please try again.');
        }

        setIsListening(false);
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      setIsListening(true);
      setError(null);
    } catch (err) {
      console.error('Error starting recording:', err);
      setError('Microphone access denied. Please allow microphone permissions.');
      setIsListening(false);
    }
  }, []);

  const startListening = useCallback(() => {
    setError(null);

    if (usingFallbackRef.current) {
      finalTranscriptRef.current = '';
      setTranscript('');
      startFallbackRecording();
      return;
    }

    if (!recognitionRef.current) {
      setError('Speech recognition is not supported in this browser. Please use Chrome or Edge.');
      return;
    }

    try {
      finalTranscriptRef.current = '';
      setTranscript('');
      recognitionRef.current.start();
    } catch (err) {
      console.error('Error starting speech recognition:', err);
      usingFallbackRef.current = true;
      startFallbackRecording();
    }
  }, [startFallbackRecording]);

  const stopListening = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
      return;
    }
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    setIsListening(false);
  }, []);

  const resetTranscript = useCallback(() => {
    finalTranscriptRef.current = '';
    setTranscript('');
    setError(null);
  }, []);

  return { transcript, isListening, error, startListening, stopListening, resetTranscript, supported };
}
