import webpush from 'web-push';

export async function sendPushNotification(
  subscription: any,
  payload: { title: string; body: string; url?: string }
) {
  if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    console.warn('VAPID keys are not set. Push notifications will not work.');
    return { success: false, error: 'keys_not_set' };
  }

  try {
    webpush.setVapidDetails(
      'mailto:contato@liturgiasje.com.br',
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
    );

    const pushPayload = JSON.stringify({
      title: payload.title,
      body: payload.body,
      url: payload.url || '/'
    });

    await webpush.sendNotification(subscription, pushPayload);
    return { success: true };
  } catch (error: any) {
    console.error('Error sending push notification:', error);
    
    // Se o erro for 410 ou 404, a subscrição expirou ou não é mais válida
    if (error.statusCode === 410 || error.statusCode === 404) {
      return { success: false, error: 'expired' };
    }
    
    return { success: false, error: error.message };
  }
}
