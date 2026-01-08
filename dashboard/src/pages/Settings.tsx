import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../lib/api';

interface WhatsAppInfo {
  verifiedName: string;
  phoneNumber: string;
  qualityRating: string;
  messagingLimit: string;
}

interface Webhooks {
  whatsapp: string;
  woocommerceOrder: string;
  woocommerceCustomer: string;
  woocommerceCart: string;
}

export default function Settings() {
  const [whatsappInfo, setWhatsappInfo] = useState<WhatsAppInfo | null>(null);
  const [webhooks, setWebhooks] = useState<Webhooks | null>(null);
  const [testPhone, setTestPhone] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const [waInfo, webhookUrls] = await Promise.all([
        api.get('/api/settings/whatsapp').catch(() => ({ data: { whatsapp: null } })),
        api.get('/api/settings/webhooks'),
      ]);
      setWhatsappInfo(waInfo.data.whatsapp);
      setWebhooks(webhookUrls.data.webhooks);
    } catch (error) {
      console.error('Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  const testWhatsApp = async () => {
    if (!testPhone) {
      toast.error('Please enter a phone number');
      return;
    }

    try {
      await api.post('/api/settings/whatsapp/test', { phone: testPhone });
      toast.success('Test message sent!');
    } catch (error) {
      toast.error('Failed to send test message');
    }
  };

  const copyWebhook = (url: string) => {
    navigator.clipboard.writeText(url);
    toast.success('Copied to clipboard');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Settings</h2>
        <p className="mt-1 text-sm text-gray-500">Configure your WhatsApp automation</p>
      </div>

      {/* WhatsApp Account */}
      <div className="bg-white shadow rounded-lg p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">WhatsApp Business Account</h3>

        {whatsappInfo ? (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-gray-500">Verified Name</label>
              <p className="font-medium text-gray-900">{whatsappInfo.verifiedName}</p>
            </div>
            <div>
              <label className="text-sm text-gray-500">Phone Number</label>
              <p className="font-medium text-gray-900">{whatsappInfo.phoneNumber}</p>
            </div>
            <div>
              <label className="text-sm text-gray-500">Quality Rating</label>
              <p
                className={`font-medium ${
                  whatsappInfo.qualityRating === 'GREEN'
                    ? 'text-green-600'
                    : whatsappInfo.qualityRating === 'YELLOW'
                    ? 'text-yellow-600'
                    : 'text-red-600'
                }`}
              >
                {whatsappInfo.qualityRating}
              </p>
            </div>
            <div>
              <label className="text-sm text-gray-500">Messaging Limit</label>
              <p className="font-medium text-gray-900">{whatsappInfo.messagingLimit}</p>
            </div>
          </div>
        ) : (
          <p className="text-gray-500">Unable to fetch WhatsApp account info. Check your API configuration.</p>
        )}

        <div className="mt-6 pt-6 border-t border-gray-200">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Test WhatsApp Connection
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={testPhone}
              onChange={(e) => setTestPhone(e.target.value)}
              placeholder="+91XXXXXXXXXX"
              className="flex-1 rounded-lg border border-gray-300 px-3 py-2 focus:ring-primary-500 focus:border-primary-500"
            />
            <button
              onClick={testWhatsApp}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
            >
              Send Test
            </button>
          </div>
        </div>
      </div>

      {/* Webhook URLs */}
      <div className="bg-white shadow rounded-lg p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Webhook URLs</h3>
        <p className="text-sm text-gray-500 mb-4">
          Configure these URLs in your WhatsApp Business and WooCommerce settings
        </p>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              WhatsApp Webhook
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                readOnly
                value={webhooks?.whatsapp || ''}
                className="flex-1 rounded-lg border border-gray-300 px-3 py-2 bg-gray-50 text-sm"
              />
              <button
                onClick={() => copyWebhook(webhooks?.whatsapp || '')}
                className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Copy
              </button>
            </div>
            <p className="mt-1 text-xs text-gray-500">
              Add this in Meta Business Suite → WhatsApp → Configuration → Webhooks
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              WooCommerce Order Webhook
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                readOnly
                value={webhooks?.woocommerceOrder || ''}
                className="flex-1 rounded-lg border border-gray-300 px-3 py-2 bg-gray-50 text-sm"
              />
              <button
                onClick={() => copyWebhook(webhooks?.woocommerceOrder || '')}
                className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Copy
              </button>
            </div>
            <p className="mt-1 text-xs text-gray-500">
              WooCommerce → Settings → Advanced → Webhooks → Add webhook (Order created/updated)
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              WooCommerce Customer Webhook
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                readOnly
                value={webhooks?.woocommerceCustomer || ''}
                className="flex-1 rounded-lg border border-gray-300 px-3 py-2 bg-gray-50 text-sm"
              />
              <button
                onClick={() => copyWebhook(webhooks?.woocommerceCustomer || '')}
                className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Copy
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Message Settings */}
      <div className="bg-white shadow rounded-lg p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Message Settings</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Messaging Window Start
            </label>
            <input
              type="number"
              defaultValue={9}
              min={0}
              max={23}
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
            />
            <p className="mt-1 text-xs text-gray-500">Hour (24-format) when messages can start</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Messaging Window End
            </label>
            <input
              type="number"
              defaultValue={21}
              min={0}
              max={23}
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
            />
            <p className="mt-1 text-xs text-gray-500">Hour (24-format) when messages stop</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Cart Abandonment Delay (minutes)
            </label>
            <input
              type="number"
              defaultValue={60}
              min={15}
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Max Messages/Day
            </label>
            <input
              type="number"
              defaultValue={1000}
              min={100}
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
            />
          </div>
        </div>
        <button className="mt-4 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700">
          Save Settings
        </button>
      </div>
    </div>
  );
}
