import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service - Shorts Generator",
  description: "Terms of Service for Shorts Generator application",
};

export default function TermsOfServicePage() {
  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto bg-white shadow-sm rounded-lg p-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">Terms of Service</h1>
        
        <div className="prose prose-lg max-w-none">
          <p className="text-gray-600 mb-6">
            <strong>Last updated:</strong> {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
          </p>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">1. Acceptance of Terms</h2>
            <p className="text-gray-700 mb-4">
              By accessing and using Shorts Generator ("the Service"), you accept and agree to be bound by the terms and provision of this agreement. If you do not agree to abide by the above, please do not use this service.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">2. Description of Service</h2>
            <p className="text-gray-700 mb-4">
              Shorts Generator is a web-based application that allows users to create and generate short-form video content, including but not limited to:
            </p>
            <ul className="list-disc pl-6 text-gray-700 mb-4 space-y-2">
              <li>Generating video backgrounds using AI</li>
              <li>Creating audio tracks for videos</li>
              <li>Rendering videos with custom text, emojis, and animations</li>
              <li>Uploading videos directly to YouTube channels</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">3. User Accounts</h2>
            <h3 className="text-xl font-semibold text-gray-800 mb-3">3.1 Account Creation</h3>
            <p className="text-gray-700 mb-4">
              To use certain features of the Service, you must register for an account by signing in with Google. You agree to provide accurate, current, and complete information during the registration process.
            </p>

            <h3 className="text-xl font-semibold text-gray-800 mb-3">3.2 Account Security</h3>
            <p className="text-gray-700 mb-4">
              You are responsible for safeguarding your account credentials and for all activities that occur under your account. You agree to notify us immediately of any unauthorized use of your account.
            </p>

            <h3 className="text-xl font-semibold text-gray-800 mb-3">3.3 Account Termination</h3>
            <p className="text-gray-700 mb-4">
              We reserve the right to suspend or terminate your account at any time, with or without notice, for conduct that we believe violates these Terms of Service or is harmful to other users, us, or third parties.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">4. Acceptable Use</h2>
            <p className="text-gray-700 mb-4">You agree not to use the Service to:</p>
            <ul className="list-disc pl-6 text-gray-700 mb-4 space-y-2">
              <li>Violate any applicable laws or regulations</li>
              <li>Infringe upon the rights of others, including intellectual property rights</li>
              <li>Upload, post, or transmit any content that is illegal, harmful, threatening, abusive, or offensive</li>
              <li>Impersonate any person or entity or falsely state or misrepresent your affiliation with any person or entity</li>
              <li>Interfere with or disrupt the Service or servers or networks connected to the Service</li>
              <li>Attempt to gain unauthorized access to any portion of the Service</li>
              <li>Use the Service for any commercial purpose without our express written consent</li>
              <li>Create content that promotes hate speech, violence, or discrimination</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">5. User Content</h2>
            <h3 className="text-xl font-semibold text-gray-800 mb-3">5.1 Ownership</h3>
            <p className="text-gray-700 mb-4">
              You retain ownership of any content you create using the Service. By using the Service, you grant us a worldwide, non-exclusive, royalty-free license to use, store, and process your content solely for the purpose of providing the Service to you.
            </p>

            <h3 className="text-xl font-semibold text-gray-800 mb-3">5.2 Content Responsibility</h3>
            <p className="text-gray-700 mb-4">
              You are solely responsible for the content you create and upload. You represent and warrant that you have all necessary rights to use, create, and distribute such content, and that your content does not infringe upon the rights of any third party.
            </p>

            <h3 className="text-xl font-semibold text-gray-800 mb-3">5.3 Content Removal</h3>
            <p className="text-gray-700 mb-4">
              We reserve the right to remove any content that violates these Terms of Service or that we determine, in our sole discretion, to be harmful, offensive, or inappropriate.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">6. YouTube Integration</h2>
            <p className="text-gray-700 mb-4">
              Our Service integrates with YouTube API Services. By connecting your YouTube account, you agree to:
            </p>
            <ul className="list-disc pl-6 text-gray-700 mb-4 space-y-2">
              <li>Comply with YouTube's Terms of Service and Community Guidelines</li>
              <li>Grant us permission to upload videos to your YouTube channel on your behalf</li>
              <li>Ensure that content uploaded to YouTube complies with YouTube's policies</li>
              <li>Be responsible for all content uploaded to your YouTube channel through our Service</li>
            </ul>
            <p className="text-gray-700 mb-4">
              You can disconnect your YouTube account at any time through the Settings page. We are not responsible for any issues arising from your use of YouTube's services.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">7. Intellectual Property</h2>
            <p className="text-gray-700 mb-4">
              The Service and its original content, features, and functionality are owned by Shorts Generator and are protected by international copyright, trademark, patent, trade secret, and other intellectual property laws. You may not copy, modify, distribute, sell, or lease any part of our Service without our express written permission.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">8. Payment and Credits</h2>
            <p className="text-gray-700 mb-4">
              Certain features of the Service may require payment or the use of credits. You agree to pay all fees associated with your use of the Service. All fees are non-refundable unless otherwise stated. We reserve the right to change our pricing at any time with reasonable notice.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">9. Service Availability</h2>
            <p className="text-gray-700 mb-4">
              We strive to provide continuous availability of the Service, but we do not guarantee uninterrupted access. The Service may be unavailable due to maintenance, updates, technical issues, or circumstances beyond our control. We are not liable for any loss or damage resulting from Service unavailability.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">10. Disclaimer of Warranties</h2>
            <p className="text-gray-700 mb-4">
              THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT. WE DO NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, SECURE, OR ERROR-FREE.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">11. Limitation of Liability</h2>
            <p className="text-gray-700 mb-4">
              TO THE MAXIMUM EXTENT PERMITTED BY LAW, WE SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS OR REVENUES, WHETHER INCURRED DIRECTLY OR INDIRECTLY, OR ANY LOSS OF DATA, USE, GOODWILL, OR OTHER INTANGIBLE LOSSES, RESULTING FROM YOUR USE OF THE SERVICE.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">12. Indemnification</h2>
            <p className="text-gray-700 mb-4">
              You agree to indemnify, defend, and hold harmless Shorts Generator and its officers, directors, employees, and agents from and against any claims, liabilities, damages, losses, and expenses, including reasonable attorneys' fees, arising out of or in any way connected with your use of the Service or violation of these Terms of Service.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">13. Changes to Terms</h2>
            <p className="text-gray-700 mb-4">
              We reserve the right to modify these Terms of Service at any time. We will notify users of any material changes by posting the updated terms on this page and updating the "Last updated" date. Your continued use of the Service after such modifications constitutes acceptance of the updated terms.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">14. Governing Law</h2>
            <p className="text-gray-700 mb-4">
              These Terms of Service shall be governed by and construed in accordance with the laws of the jurisdiction in which the Service operates, without regard to its conflict of law provisions.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">15. Contact Information</h2>
            <p className="text-gray-700 mb-4">
              If you have any questions about these Terms of Service, please contact us at:
            </p>
            <div className="bg-gray-50 p-4 rounded-md">
              <p className="text-gray-700">
                <strong>Email:</strong> support@shorts-generator.com
              </p>
              <p className="text-gray-700 mt-2">
                <strong>Website:</strong> <a href="/" className="text-blue-600 hover:underline">shorts-generator.com</a>
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

