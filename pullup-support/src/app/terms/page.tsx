import Link from 'next/link';

export const metadata = {
  title: 'Terms of Service | PullUp',
  description: 'Terms of Service for PullUp mobile application. Read user agreements, community guidelines, ride-sharing rules, and platform policies.',
};

export default function TermsPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12 space-y-10">
      {/* Header */}
      <div className="border-b border-[#EADDD0] pb-6 space-y-2">
        <h1 className="text-3xl sm:text-4xl font-extrabold text-[#1A1513] tracking-tight">
          Terms of Service
        </h1>
        <p className="text-xs text-[#665A55]">
          <strong>Effective Date:</strong> 25 August 2026 | <strong>Last Updated:</strong> 4 September 2026
        </p>
        <p className="text-sm text-[#665A55] leading-relaxed pt-2">
          These Terms of Service (&quot;Terms&quot;) govern your access to and use of the PullUp mobile application, backend services, and official support website.
        </p>
      </div>

      {/* Content */}
      <div className="prose prose-neutral max-w-none text-xs sm:text-sm text-[#665A55] space-y-8 leading-relaxed">
        <section className="space-y-3">
          <h2 className="text-lg font-bold text-[#1A1513]">1. Acceptance of Terms</h2>
          <p>
            By creating an account, registering as a driver or passenger, or using the PullUp application, you agree to be bound by these Terms and our <Link href="/privacy" className="text-[#D4500A] font-semibold underline">Privacy Policy</Link>. If you do not agree, you must not access or use the application.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-bold text-[#1A1513]">2. Eligibility & Account Registration</h2>
          <p>
            PullUp is designed specifically for accredited university communities:
          </p>
          <ul className="list-disc list-inside space-y-1 pl-2">
            <li>You must register using a valid, accredited university domain email address.</li>
            <li>You must provide accurate, current, and complete profile information.</li>
            <li>You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-bold text-[#1A1513]">3. Platform Scope & Role</h2>
          <p>
            PullUp is a peer-to-peer technology platform that enables eligible university students and staff to coordinate carpool and taxi-pool rides. PullUp does not own vehicles, employ drivers, or operate as a transportation carrier. Drivers and passengers connect independently via the platform.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-bold text-[#1A1513]">4. Driver Verification & Responsibilities</h2>
          <p>
            Users who offer rides as drivers on PullUp agree to:
          </p>
          <ul className="list-disc list-inside space-y-1 pl-2">
            <li>Submit a valid, current driving licence for verification.</li>
            <li>Possess a valid motor vehicle driving licence, active vehicle registration, and required insurance.</li>
            <li>Operate vehicles safely and in accordance with all local traffic laws and regulations.</li>
            <li>Maintain vehicles in safe mechanical condition.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-bold text-[#1A1513]">5. Passenger Responsibilities & Community Etiquette</h2>
          <p>
            All users (passengers and drivers) agree to adhere to community safety standards:
          </p>
          <ul className="list-disc list-inside space-y-1 pl-2">
            <li>Arrive punctually at designated pickup locations.</li>
            <li>Treat fellow community members with respect and courtesy.</li>
            <li>Prohibit unlawful behavior, harassment, substance abuse, or damage to vehicles.</li>
            <li>Respect cancellation windows and ride confirmation agreements.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-bold text-[#1A1513]">6. Fares, Payments & Cancellations</h2>
          <p>
            Ride fare estimates are calculated based on road distance and shared capacity. Payment processing is facilitated via Razorpay.
          </p>
          <ul className="list-disc list-inside space-y-1 pl-2">
            <li>All checkout transactions and payments are securely processed through Razorpay.</li>
            <li>Cancellations are subject to the cancellation and penalty policies specified within the PullUp mobile application.</li>
            <li>Disputes or payment inquiries should be submitted to <a href="mailto:krish@pullupapp.in" className="text-[#D4500A] font-semibold underline">krish@pullupapp.in</a> within 7 days of the ride.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-bold text-[#1A1513]">7. Account Termination & Suspension</h2>
          <p>
            We reserve the right to suspend or terminate accounts that violate these Terms, engage in fraudulent activity, submit invalid verification documentation, or breach community safety guidelines.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-bold text-[#1A1513]">8. Disclaimer & Limitation of Liability</h2>
          <p>
            PullUp provides the platform on an &quot;AS IS&quot; and &quot;AS AVAILABLE&quot; basis. To the maximum extent permitted by applicable law, PullUp disclaims all warranties, express or implied. PullUp shall not be liable for indirect, incidental, special, or consequential damages arising out of or in connection with ride-sharing activities or platform usage.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-bold text-[#1A1513]">9. Contact Information</h2>
          <p>
            For questions regarding these Terms or platform policies, please reach out to:
          </p>
          <div className="bg-white p-4 rounded-xl border border-[#EADDD0] text-xs">
            <p><strong>PullUp Support Desk:</strong> <a href="mailto:krish@pullupapp.in" className="text-[#D4500A] font-semibold underline">krish@pullupapp.in</a></p>
            <p><strong>Help Center:</strong> <Link href="/support" className="text-[#D4500A] font-semibold underline">PullUp Support Center</Link></p>
          </div>
        </section>
      </div>
    </div>
  );
}
