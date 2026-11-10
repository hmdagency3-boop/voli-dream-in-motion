import { supabase } from '@/lib/supabase';
import { getBrowserName, getDeviceDetails, getDeviceId, getNetworkInfo, getPublicIp } from '@/lib/device-info';

/** Browser-only: records this member's device, network and IP into member_devices via voli_report_device. Never throws. */
export async function reportDevice(): Promise<void> {
  try {
    const [details, ip] = await Promise.all([getDeviceDetails(), getPublicIp()]);
    const { network, carrier } = getNetworkInfo();
    const browser = getBrowserName();
    const os = [details.platform, details.osVersion].filter(Boolean).join(' ');
    const { error } = await supabase.rpc('voli_report_device' as never, {
      p_device_id: getDeviceId(),
      p_brand: details.brand || details.platform,
      p_model: [details.model, browser].filter(Boolean).join(' · '),
      p_os: os,
      p_network: network,
      p_carrier: carrier,
      p_client_ip: ip,
    } as never);
    if (error) console.warn('voli_report_device failed:', error.message);
  } catch { /* never block the app */ }
}
