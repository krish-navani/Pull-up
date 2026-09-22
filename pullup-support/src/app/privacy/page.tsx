import Link from 'next/link';

export const metadata = {
  title: 'Privacy Policy | PullUp',
  description: 'Privacy Policy for PullUp mobile application. Learn how we handle account data, location information, ride bookings, payments, and user rights.',
};

export default function PrivacyPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12 space-y-10">
      {/* Header */}
      <div className="border-b border-[#EADDD0] pb-6 space-y-2">
        <h1 className="text-3xl sm:text-4xl font-extrabold text-[#1A1513] tracking-tight">
          Privacy Policy
        </h1>
        <p className="text-xs text-[#665A55]">
          <strong>Effective Date:</strong> 25 August 2026 | <strong>Last Updated:</strong> 4 September 2026
        </p>
        <p className="text-sm text-[#665A55] leading-relaxed pt-2">
          This Privacy Policy describes how PullUp (&quot;we&quot;, &quot;our&quot;, or &quot;us&quot;) collects, uses, stores, and protects information when you use our mobile application and associated backend services.
        </p>
      </div>

      {/* Content Body */}
      <div className="prose prose-neutral max-w-none text-xs sm:text-sm text-[#665A55] space-y-8 leading-relaxed">
        {/* Section 1 */}
        <section className="space-y-3">
          <h2 className="text-lg font-bold text-[#1A1513]">1. Who Operates PullUp & Contact Details</h2>
          <p>
            PullUp is operated by the PullUp development team. If you have questions, concerns, or requests regarding this Privacy Policy or your personal information, please contact our privacy desk:
          </p>
          <div className="bg-white p-4 rounded-xl border border-[#EADDD0] text-xs space-y-1">
            <p><strong>Privacy Contact Email:</strong> <a href="mailto:krish@pullupapp.in" className="text-[#D4500A] font-semibold underline">krish@pullupapp.in</a></p>
            <p><strong>Official Support Desk:</strong> <Link href="/support" className="text-[#D4500A] font-semibold underline">PullUp Support Center</Link></p>
          </div>
        </section>

        {/* Section 2 */}
        <section className="space-y-3">
          <h2 className="text-lg font-bold text-[#1A1513]">2. Information We Collect</h2>
          <p>
            We collect only the information necessary to provide, secure, and improve our campus carpooling and taxi-pooling services:
          </p>
          <ul className="list-disc list-inside space-y-2 pl-2 bg-white p-4 rounded-xl border border-[#EADDD0]">
            <li><strong>Account & University Identity:</strong> Accredited university email address (e.g. <code>@atlasskilltech.university</code>), full name, phone number, profile photo, student/staff role, division, course, and saved home or frequently visited locations.</li>
            <li><strong>Driver Verification Data:</strong> Driving licence images, licence numbers, vehicle details, and verification status provided by users who register as drivers.</li>
            <li><strong>Location Information:</strong> Precise GPS location (both foreground while using the app and background during active ride tracking) when permitted by your device permissions, used to enable route matching, geofence arrival alerts, and live map navigation.</li>
            <li><strong>Ride & Booking Records:</strong> Pickup points, destination coordinates, departure schedules, seat availability, ride status, waitlist data, cancellation history, and fare splits.</li>
            <li><strong>Payment & Transaction Information:</strong> Checkout order identifiers, payment transaction hashes, signature verification records, refund history, and payout audit references. <em>PullUp does NOT collect or store complete credit card numbers, debit card numbers, CVVs, or bank account credentials.</em></li>
            <li><strong>Chat & Media Attachments:</strong> In-app group messages and images uploaded by users within active ride group chats.</li>
            <li><strong>Device Tokens & Technical Logs:</strong> Expo Push Notification tokens, Firebase Cloud Messaging (FCM) tokens, device model, operating system version, system error logs, and route optimization cache data.</li>
          </ul>
        </section>

        {/* Section 3 */}
        <section className="space-y-3">
          <h2 className="text-lg font-bold text-[#1A1513]">3. Camera & Photo Gallery Access</h2>
          <p>
            The PullUp mobile application requests access to your device camera or photo library solely when you explicitly choose to:
          </p>
          <ul className="list-disc list-inside space-y-1 pl-2">
            <li>Upload or update your user profile picture.</li>
            <li>Photograph or select a driving licence image for driver verification.</li>
            <li>Send a photo attachment within a ride group chat.</li>
          </ul>
          <p>
            Uploaded images are stored securely on Cloudinary. You can modify or revoke camera and photo library permissions at any time in your iOS or Android device settings.
          </p>
        </section>

        {/* Section 4 */}
        <section className="space-y-3">
          <h2 className="text-lg font-bold text-[#1A1513]">4. Payment Processing (Razorpay)</h2>
          <p>
            All online checkout payments, seat bookings, driver payouts, and refund processing are handled externally by <strong>Razorpay</strong>. PullUp integrates with Razorpay SDKs and receives payment status callbacks, order IDs, and verification signatures. PullUp does not store or process payment card data on its servers. For details on Razorpay&apos;s data handling, please refer to Razorpay&apos;s Privacy Policy.
          </p>
        </section>

        {/* Section 5 */}
        <section className="space-y-3">
          <h2 className="text-lg font-bold text-[#1A1513]">5. Service Providers & Third-Party Sharing</h2>
          <p>
            We rely on trusted third-party cloud infrastructure providers to operate PullUp:
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
            <div className="bg-white p-3 rounded-lg border border-[#EADDD0]">
              <strong>Firebase (Google Cloud):</strong> Authentication, real-time database (Cloud Firestore), and push messaging (FCM).
            </div>
            <div className="bg-white p-3 rounded-lg border border-[#EADDD0]">
              <strong>Google Maps Platform:</strong> Maps display, geocoding, distance calculation, and route polyline generation.
            </div>
            <div className="bg-white p-3 rounded-lg border border-[#EADDD0]">
              <strong>Cloudinary:</strong> Secure cloud storage for profile pictures, licence verification images, and chat photos.
            </div>
            <div className="bg-white p-3 rounded-lg border border-[#EADDD0]">
              <strong>Razorpay:</strong> Payment gateway and transaction processing.
            </div>
          </div>
          <p className="pt-1">
            To provide ride-sharing functionality, basic ride details (first name, pickup location, and ride status) are shared between matched drivers and passengers. <strong>We do not sell your personal information to third parties or advertisers.</strong>
          </p>
        </section>

        {/* Section 6 */}
        <section className="space-y-3">
          <h2 className="text-lg font-bold text-[#1A1513]">6. How We Use Your Information</h2>
          <p>Information collected is used strictly to:</p>
          <ul className="list-disc list-inside space-y-1 pl-2">
            <li>Authenticate eligible university users and maintain community safety.</li>
            <li>Match passengers and drivers traveling on shared routes.</li>
            <li>Calculate road-distance fares and process ride bookings.</li>
            <li>Deliver push notifications for ride updates, join requests, and chat messages.</li>
            <li>Verify driver eligibility and licence documentation.</li>
            <li>Investigate reported issues, prevent fraud, and comply with legal requirements.</li>
          </ul>
        </section>

        {/* Section 7 */}
        <section className="space-y-3">
          <h2 className="text-lg font-bold text-[#1A1513]">7. Data Retention & Account Deletion</h2>
          <p>
            We retain your personal data for as long as your account remains active. You may request account deletion at any time:
          </p>
          <ul className="list-disc list-inside space-y-1 pl-2">
            <li><strong>In-App Deletion:</strong> Go to <em>Profile → Privacy & Account → Delete Account</em> in the PullUp mobile app.</li>
            <li><strong>Email Request:</strong> Send an account deletion request to <a href="mailto:krish@pullupapp.in" className="text-[#D4500A] font-semibold underline">krish@pullupapp.in</a> from your registered university email address.</li>
          </ul>
          <p>
            Upon account deletion, your profile credentials, authentication record, push tokens, and personal details are permanently removed. Transaction audit logs and completed ride records may be retained in anonymized form where required by law, accounting standards, or anti-fraud requirements.
          </p>
        </section>

        {/* Section 8 */}
        <section className="space-y-3">
          <h2 className="text-lg font-bold text-[#1A1513]">8. Children&apos;s Privacy & Eligibility</h2>
          <p>
            PullUp is strictly intended for university students, faculty, and campus community members who meet applicable age and institutional requirements. We do not knowingly collect personal information from children under 16 years of age.
          </p>
        </section>

        {/* Section 9 */}
        <section className="space-y-3">
          <h2 className="text-lg font-bold text-[#1A1513]">9. Updates to This Policy</h2>
          <p>
            We may update this Privacy Policy from time to time to reflect service enhancements or legal requirements. Material changes will be updated on this page with a revised effective date.
          </p>
        </section>
      </div>

      {/* Footer Navigation */}
      <div className="border-t border-[#EADDD0] pt-6 flex flex-wrap gap-4 text-xs font-semibold text-[#D4500A]">
        <Link href="/support" className="hover:underline">PullUp Support Center →</Link>
        <Link href="/terms" className="hover:underline">Terms of Service →</Link>
        <Link href="/contact" className="hover:underline">Contact Support →</Link>
      </div>
    </div>
  );
}
