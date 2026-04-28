import { supabase } from '@/lib/supabase';
import { decode } from 'base64-arraybuffer';
import Constants from 'expo-constants';
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

const BUCKET = 'bug-screenshots';

export type BugScreenshot = {
  base64: string;
  mimeType: string;
};

export async function pickBugScreenshot(): Promise<BugScreenshot | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.6,
    base64: true,
  });
  if (result.canceled) return null;
  const asset = result.assets?.[0];
  if (!asset?.base64) return null;
  return { base64: asset.base64, mimeType: asset.mimeType ?? 'image/jpeg' };
}

async function uploadScreenshot(
  userId: string,
  screenshot: BugScreenshot,
): Promise<string> {
  const ext = screenshot.mimeType.includes('png') ? 'png' : 'jpg';
  const path = `${userId}/${Date.now()}.${ext}`;
  const bytes = decode(screenshot.base64);

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, bytes, {
      upsert: false,
      contentType: screenshot.mimeType,
    });
  if (error) throw new Error(`Upload screenshot : ${error.message}`);

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

export type SubmitBugInput = {
  userId: string;
  title: string;
  description: string;
  screenshot?: BugScreenshot | null;
};

export type SubmitBugResult = {
  taskId: string | null;
  taskUrl: string | null;
};

export async function submitBugReport(input: SubmitBugInput): Promise<SubmitBugResult> {
  let screenshotUrl: string | undefined;
  if (input.screenshot) {
    screenshotUrl = await uploadScreenshot(input.userId, input.screenshot);
  }

  const context = {
    appVersion: Constants.expoConfig?.version ?? null,
    platform: Platform.OS,
    osVersion: String(Platform.Version ?? ''),
    locale: Intl?.DateTimeFormat?.().resolvedOptions?.().locale ?? null,
  };

  const { data, error } = await supabase.functions.invoke<{
    ok: boolean;
    taskId?: string;
    taskUrl?: string;
    error?: string;
    field?: string;
    status?: number;
  }>('report-bug', {
    body: {
      title: input.title,
      description: input.description,
      screenshotUrl,
      context,
    },
  });

  // Si l'edge function renvoie un statut non-2xx, le SDK met `error` ET tente
  // de parser le body en `data`. On préfère le message du body (typé) au
  // message générique du SDK ("Edge Function returned a non-2xx status code").
  if (error) {
    let bodyMessage: string | null = null;
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx && typeof ctx.text === 'function') {
        const raw = await ctx.text();
        try {
          const parsed = JSON.parse(raw) as { error?: string; field?: string; status?: number };
          if (parsed?.error) {
            bodyMessage =
              parsed.error +
              (parsed.field ? ` (${parsed.field})` : '') +
              (parsed.status ? ` [upstream ${parsed.status}]` : '');
          }
        } catch {
          if (raw) bodyMessage = raw.slice(0, 200);
        }
      }
    } catch {
      // ignore
    }
    throw new Error(bodyMessage ?? error.message ?? 'report_bug_failed');
  }
  if (!data?.ok) {
    const detail =
      (data?.error ?? 'report_bug_failed') +
      (data?.field ? ` (${data.field})` : '') +
      (data?.status ? ` [upstream ${data.status}]` : '');
    throw new Error(detail);
  }

  return { taskId: data.taskId ?? null, taskUrl: data.taskUrl ?? null };
}
