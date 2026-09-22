import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 sm:py-16 space-y-16">
      {/* Hero Section */}
      <section className="text-center max-w-3xl mx-auto space-y-6 pt-4">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#FDF2EB] border border-[#EADDD0] text-[#D4500A] text-xs font-semibold">
          <span className="w-2 h-2 rounded-full bg-[#D4500A] animate-pulse"></span>
          Official Support & Information Hub
        </div>

        <h1 className="text-3xl sm:text-5xl font-extrabold text-[#1A1513] tracking-tight leading-tight">
          Smart, Verified Campus Carpooling & Taxi-Pooling
        </h1>

        <p className="text-base sm:text-lg text-[#665A55] leading-relaxed">
          PullUp is a campus mobility platform created for university communities. It enables verified students and campus staff to discover, create, and share carpool and taxi-pool rides safely and efficiently.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-2">
          <Link
            href="/support"
            className="w-full sm:w-auto px-6 py-3.5 rounded-xl bg-[#D4500A] text-white font-semibold text-sm hover:bg-[#B84206] transition-all shadow-sm hover:shadow-md text-center"
          >
            Visit Support Center
          </Link>
          <Link
            href="/privacy"
            className="w-full sm:w-auto px-6 py-3.5 rounded-xl bg-white border border-[#EADDD0] text-[#1A1513] font-semibold text-sm hover:bg-[#FDFBF7] transition-all text-center"
          >
            Read Privacy Policy
          </Link>
        </div>
      </section>

      {/* Core Features Grid */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4">
        <div className="bg-white p-6 rounded-2xl border border-[#EADDD0] shadow-sm space-y-3">
          <div className="w-10 h-10 rounded-xl bg-[#FDF2EB] text-[#D4500A] flex items-center justify-center font-bold text-lg">
            🛡️
          </div>
          <h3 className="text-lg font-bold text-[#1A1513]">Verified Campus Profiles</h3>
          <p className="text-sm text-[#665A55] leading-relaxed">
            All users authenticate using verified university email domain credentials to maintain community safety and trust.
          </p>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-[#EADDD0] shadow-sm space-y-3">
          <div className="w-10 h-10 rounded-xl bg-[#FDF2EB] text-[#D4500A] flex items-center justify-center font-bold text-lg">
            🚕
          </div>
          <h3 className="text-lg font-bold text-[#1A1513]">Flexible Ride Matching</h3>
          <p className="text-sm text-[#665A55] leading-relaxed">
            Create or join carpools and taxi-pools along shared routes to campus hubs, reducing transit costs and traffic congestion.
          </p>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-[#EADDD0] shadow-sm space-y-3">
          <div className="w-10 h-10 rounded-xl bg-[#FDF2EB] text-[#D4500A] flex items-center justify-center font-bold text-lg">
            📍
          </div>
          <h3 className="text-lg font-bold text-[#1A1513]">Live Tracking & Group Chat</h3>
          <p className="text-sm text-[#665A55] leading-relaxed">
            Coordinate pickup points in real-time with integrated route maps, live pin sharing, and instant in-app group messaging.
          </p>
        </div>
      </section>

      {/* App Store Support Callout */}
      <section className="bg-white rounded-2xl border border-[#EADDD0] p-8 sm:p-10 shadow-sm flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="space-y-2 max-w-xl">
          <h2 className="text-2xl font-bold text-[#1A1513]">Need Assistance with PullUp?</h2>
          <p className="text-sm text-[#665A55] leading-relaxed">
            Our support team is here to assist with account login, driver verification, ride booking, or payment questions.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
          <Link
            href="/support"
            className="px-5 py-3 rounded-xl bg-[#D4500A] text-white font-semibold text-sm hover:bg-[#B84206] transition-all text-center"
          >
            Contact Support
          </Link>
          <Link
            href="/terms"
            className="px-5 py-3 rounded-xl bg-[#FDFBF7] border border-[#EADDD0] text-[#1A1513] font-semibold text-sm hover:bg-white transition-all text-center"
          >
            Terms of Service
          </Link>
        </div>
      </section>

      {/* App Information Note */}
      <section className="border-t border-[#EADDD0] pt-8 text-center text-xs text-[#665A55] max-w-2xl mx-auto space-y-2">
        <p className="font-semibold text-[#1A1513]">Apple App Store Support & Compliance</p>
        <p>
          This website serves as the official public support URL for the PullUp iOS application listed on Apple App Store Connect. For privacy inquiries or account deletion support, contact <a href="mailto:krish@pullupapp.in" className="text-[#D4500A] font-semibold underline">krish@pullupapp.in</a>.
        </p>
      </section>
    </div>
  );
}
