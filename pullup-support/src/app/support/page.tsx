import Link from 'next/link';

export const metadata = {
  title: 'PullUp Support & Help Center | App Store Support',
  description: 'Official PullUp App Support Center. Get help with account login, ride booking, driver verification, payment issues, or contact support.',
};

export default function SupportPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12 space-y-12">
      {/* Header */}
      <div className="space-y-4 text-center sm:text-left border-b border-[#EADDD0] pb-8">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#FDF2EB] border border-[#EADDD0] text-[#D4500A] text-xs font-semibold">
          Official App Store Support URL
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-[#1A1513] tracking-tight">
          PullUp Support & Help Center
        </h1>
        <p className="text-base text-[#665A55] leading-relaxed max-w-2xl">
          Welcome to the official support portal for the PullUp mobile app. If you are experiencing technical difficulties, account issues, or have questions about ride bookings, our team is here to assist.
        </p>
      </div>

      {/* Primary Contact Banner */}
      <section className="bg-white rounded-2xl border-2 border-[#D4500A] p-6 sm:p-8 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-xl font-bold text-[#1A1513]">Contact PullUp Support Team</h2>
            <p className="text-sm text-[#665A55]">
              For direct assistance, send an email to our designated support desk:
            </p>
          </div>
          <a
            href="mailto:krish@pullupapp.in"
            className="px-5 py-3 rounded-xl bg-[#D4500A] text-white font-bold text-sm hover:bg-[#B84206] transition-all shadow-sm whitespace-nowrap"
          >
            krish@pullupapp.in
          </a>
        </div>
        <div className="text-xs text-[#665A55] bg-[#FDFBF7] p-3 rounded-lg border border-[#EADDD0] leading-relaxed">
          <strong>Operating Hours & Response Time:</strong> Support requests are reviewed Monday through Friday. We aim to respond to all inquiries within <strong>24 to 48 business hours</strong>.
        </div>
      </section>

      {/* Support Topics Grid */}
      <section className="space-y-6">
        <h2 className="text-2xl font-bold text-[#1A1513]">What We Can Help You With</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white p-5 rounded-xl border border-[#EADDD0] space-y-2">
            <div className="flex items-center gap-2 font-bold text-[#1A1513]">
              <span className="text-lg">🔐</span> Account & Login Issues
            </div>
            <p className="text-xs text-[#665A55] leading-relaxed">
              Assistance with university email domain verification, OTP delivery problems, profile details, or account recovery.
            </p>
          </div>

          <div className="bg-white p-5 rounded-xl border border-[#EADDD0] space-y-2">
            <div className="flex items-center gap-2 font-bold text-[#1A1513]">
              <span className="text-lg">🚗</span> Ride Creation & Joining
            </div>
            <p className="text-xs text-[#665A55] leading-relaxed">
              Help with creating carpools/taxi-pools, route pin matching, pickup point selection, or driver license verification.
            </p>
          </div>

          <div className="bg-white p-5 rounded-xl border border-[#EADDD0] space-y-2">
            <div className="flex items-center gap-2 font-bold text-[#1A1513]">
              <span className="text-lg">💳</span> Booking & Fare Payments
            </div>
            <p className="text-xs text-[#665A55] leading-relaxed">
              Questions regarding Razorpay checkout, fare calculations, ride cancellation policies, penalty waivers, or refund status.
            </p>
          </div>

          <div className="bg-white p-5 rounded-xl border border-[#EADDD0] space-y-2">
            <div className="flex items-center gap-2 font-bold text-[#1A1513]">
              <span className="text-lg">💬</span> Chat & Push Notifications
            </div>
            <p className="text-xs text-[#665A55] leading-relaxed">
              Troubleshooting in-app group messaging, image upload issues, or missing push notification alerts for ride updates.
            </p>
          </div>
        </div>
      </section>

      {/* Submission Instructions */}
      <section className="bg-white rounded-2xl border border-[#EADDD0] p-6 sm:p-8 space-y-4">
        <h2 className="text-xl font-bold text-[#1A1513]">What to Include in Your Support Request</h2>
        <p className="text-xs sm:text-sm text-[#665A55]">
          To help us resolve your issue quickly, please include the following details when emailing <a href="mailto:krish@pullupapp.in" className="text-[#D4500A] font-semibold underline">krish@pullupapp.in</a>:
        </p>
        <ul className="space-y-2 text-xs sm:text-sm text-[#665A55] list-disc list-inside bg-[#FDFBF7] p-4 rounded-xl border border-[#EADDD0]">
          <li><strong>Full Name & University Email:</strong> The email registered with your PullUp account.</li>
          <li><strong>Phone Number:</strong> Registered mobile phone number.</li>
          <li><strong>Device & OS Version:</strong> E.g., iPhone 15 Pro on iOS 18.1 or Samsung Galaxy S23 on Android 14.</li>
          <li><strong>Description of Issue:</strong> A step-by-step description of what happened and when it occurred.</li>
          <li><strong>Screenshots / Video (if applicable):</strong> Any error banners, booking IDs, or relevant ride screens.</li>
        </ul>
      </section>

      {/* Account Deletion Quick Link */}
      <section className="bg-[#FDF2EB] rounded-2xl border border-[#EADDD0] p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="space-y-1 text-center sm:text-left">
          <h3 className="font-bold text-[#1A1513]">Need to Delete Your Account?</h3>
          <p className="text-xs text-[#665A55]">
            You can delete your account inside the PullUp mobile app or view instructions in our Privacy Policy.
          </p>
        </div>
        <Link
          href="/privacy"
          className="px-4 py-2.5 rounded-lg bg-white border border-[#EADDD0] text-[#1A1513] text-xs font-semibold hover:bg-[#FDFBF7] transition-all whitespace-nowrap"
        >
          View Privacy & Account Rights
        </Link>
      </section>

      {/* Frequently Asked Questions */}
      <section className="space-y-4">
        <h2 className="text-xl font-bold text-[#1A1513]">Frequently Asked Questions</h2>
        <div className="space-y-3">
          <details className="bg-white p-4 rounded-xl border border-[#EADDD0] group">
            <summary className="font-semibold text-sm text-[#1A1513] cursor-pointer flex items-center justify-between">
              Who is eligible to use PullUp?
              <span className="text-[#D4500A] group-open:rotate-180 transition-transform">▼</span>
            </summary>
            <p className="text-xs text-[#665A55] mt-2 leading-relaxed">
              PullUp is restricted to eligible university students, faculty, and campus staff who register using a valid accredited university domain email address.
            </p>
          </details>

          <details className="bg-white p-4 rounded-xl border border-[#EADDD0] group">
            <summary className="font-semibold text-sm text-[#1A1513] cursor-pointer flex items-center justify-between">
              Does PullUp store my payment card details?
              <span className="text-[#D4500A] group-open:rotate-180 transition-transform">▼</span>
            </summary>
            <p className="text-xs text-[#665A55] mt-2 leading-relaxed">
              No. All payment processing, card validation, and banking transactions are handled securely by Razorpay. PullUp does not store or process complete credit card or debit card numbers on its servers.
            </p>
          </details>

          <details className="bg-white p-4 rounded-xl border border-[#EADDD0] group">
            <summary className="font-semibold text-sm text-[#1A1513] cursor-pointer flex items-center justify-between">
              How does location tracking work on PullUp?
              <span className="text-[#D4500A] group-open:rotate-180 transition-transform">▼</span>
            </summary>
            <p className="text-xs text-[#665A55] mt-2 leading-relaxed">
              Location access (foreground and background) is requested strictly when you participate in an active ride or set pickup locations to enable live route tracking, geofence arrival detection, and route matching. Location permissions can be managed at any time in your device settings.
            </p>
          </details>
        </div>
      </section>
    </div>
  );
}
