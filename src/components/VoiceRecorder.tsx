import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { AudioAttachment } from '../types/app';
import { useTranslation } from '../i18n/useTranslation';

interface Props {
  onRecordingComplete: (audio: AudioAttachment & { localUri: string }) => void;
  onClear: () => void;
  recording?: (AudioAttachment & { localUri: string }) | null;
}

const MAX_DURATION_MS = 60_000;

function formatMs(ms: number): string {
  const s = Math.floor(ms / 1000);
  const min = Math.floor(s / 60);
  const sec = s % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

export default function VoiceRecorder({ onRecordingComplete, onClear, recording }: Props) {
  const { t } = useTranslation();
  const copy = t.voiceRecorder;
  const [isRecording, setIsRecording] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const recordingRef = useRef<any>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);
  useEffect(() => () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startRecording = async () => {
    if (Platform.OS === 'web') {
      setError(copy.webUnavailable);
      return;
    }
    setError(null);
    setIsLoading(true);
    try {
      const { Audio } = require('expo-av');
      await Audio.requestPermissionsAsync();
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      recordingRef.current = recording;
      startTimeRef.current = Date.now();
      setElapsedMs(0);
      setIsRecording(true);

      timerRef.current = setInterval(() => {
        const elapsed = Date.now() - startTimeRef.current;
        setElapsedMs(elapsed);
        if (elapsed >= MAX_DURATION_MS) {
          void stopRecording();
        }
      }, 500);
    } catch {
      setError(copy.startFailed);
    } finally {
      setIsLoading(false);
    }
  };

  const stopRecording = async () => {
    if (!recordingRef.current) return;
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setIsLoading(true);
    try {
      await recordingRef.current.stopAndUnloadAsync();
      const uri = recordingRef.current.getURI();
      const duration = Date.now() - startTimeRef.current;
      recordingRef.current = null;
      setIsRecording(false);
      setElapsedMs(0);

      if (uri) {
        onRecordingComplete({
          localUri: uri,
          url: '',
          storagePath: '',
          duration,
          uploadedAt: Date.now(),
        });
      }
    } catch {
      setError(copy.stopFailed);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClear = async () => {
    if (isRecording) await stopRecording();
    onClear();
    setElapsedMs(0);
    setError(null);
  };

  if (recording?.localUri) {
    return (
      <View style={styles.container}>
        <View style={styles.doneRow}>
          <Text style={styles.doneIcon}>✓</Text>
          <Text style={styles.doneText}>
            {copy.recordedMessage} ({formatMs(recording.duration)})
          </Text>
          <TouchableOpacity onPress={handleClear} style={styles.clearBtn}>
            <Text style={styles.clearText}>✕</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {isRecording && (
        <Text style={styles.timer}>{formatMs(elapsedMs)} / 1:00</Text>
      )}
      {error && <Text style={styles.errorText}>{error}</Text>}

      <TouchableOpacity
        style={[styles.btn, isRecording && styles.btnRecording]}
        onPress={isRecording ? stopRecording : startRecording}
        disabled={isLoading}
        activeOpacity={0.7}
      >
        {isLoading ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <Text style={styles.btnIcon}>{isRecording ? '■' : '🎤'}</Text>
        )}
        <Text style={styles.btnLabel}>
          {isRecording ? copy.stopRecording : copy.recordVoice}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 8,
  },
  timer: {
    textAlign: 'center',
    fontSize: 14,
    color: '#E53935',
    marginBottom: 6,
    fontVariant: ['tabular-nums'],
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#5B8A6E',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
    gap: 6,
  },
  btnRecording: {
    backgroundColor: '#E53935',
  },
  btnIcon: {
    fontSize: 18,
  },
  btnLabel: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  doneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EAF3EC',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    gap: 8,
  },
  doneIcon: {
    fontSize: 18,
  },
  doneText: {
    flex: 1,
    fontSize: 13,
    color: '#2E5E3E',
  },
  clearBtn: {
    padding: 4,
  },
  clearText: {
    fontSize: 16,
    color: '#888',
  },
  errorText: {
    color: '#E53935',
    fontSize: 12,
    marginBottom: 6,
    textAlign: 'center',
  },
});
