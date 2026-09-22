import Link from 'next/link';

export const metadata = {
  title: 'Contact Us | PullUp Support',
  description: 'Contact PullUp Support. Get in touch with our team for account help, ride support, driver verification, or privacy requests.',
};

export default function ContactPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12 space-y-10">
      {/* Header */}
      <div className="border-b border-[#EADDD0] pb-6 space-y-2 text-center sm:text-left">
        <h1 className="text-3xl sm:text-4xl font-extrabold text-[#1A1513] tracking-tight">
          Contact PullUp
        </h1>
        <p className="text-base text-[#665A55]">
          Have questions or need assistance with the PullUp app? Our team is available to help.
        </p>
      </div>

      {/* Main Contact Card */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white p-6 sm:p-8 rounded-2xl border-2 border-[#D4500A] space-y-4 shadow-sm">
          <div className="w-12 h-12 rounded-xl bg-[#FDF2EB] text-[#D4500A] flex items-center justify-center font-extrabold text-2xl">
            ✉️
          </div>
          <div className="space-y-1">
            <h2 className="text-xl font-bold text-[#1A1513]">Direct Email Support</h2>
            <p className="text-xs text-[#665A55]">
              Send your support request directly to our team:
            </p>
          </div>
          <a
            href="mailto:krish@pullupapp.in"
            className="inline-block text-lg font-extrabold text-[#D4500A] hover:underline break-all"
          >
            krish@pullupapp.in
          </a>
          <div className="text-xs text-[#665A55] bg-[#FDFBF7] p-3 rounded-lg border border-[#EADDD0]">
            Response Time: 24-48 business hours.
          </div>
        </div>

        <div className="bg-white p-6 sm:p-8 rounded-2xl border border-[#EADDD0] space-y-4 shadow-sm flex flex-col justify-between">
          <div className="space-y-3">
            <div className="w-12 h-12 rounded-xl bg-[#FDF2EB] text-[#D4500A] flex items-center justify-center font-extrabold text-2xl">
              🏥
            </div>
            <h2 className="text-xl font-bold text-[#1A1513]">App Store Support Center</h2>
            <p className="text-xs text-[#665A55] leading-relaxed">
              Visit our comprehensive Support Center for troubleshooting guides, account recovery steps, and payment FAQs.
            </p>
          </div>
          <Link
            href="/support"
            className="w-full px-5 py-3 rounded-xl bg-[#D4500A] text-white font-bold text-sm hover:bg-[#B84206] transition-all text-center"
          >
            Go to Support Portal
          </Link>
        </div>
      </div>

      {/* Guidelines Section */}
      <section className="bg-white rounded-2xl border border-[#EADDD0] p-6 sm:p-8 space-y-3">
        <h3 className="text-lg font-bold text-[#1A1513]">What to Include in Your Email</h3>
        <p className="text-xs text-[#665A55]">
          To help us assist you as quickly as possible, please include your registered university email address, phone number, device type (iOS/Android), and any relevant screenshots or booking IDs.
        </p>
      </section>

      {/* Links Footer */}
      <div className="flex flex-wrap gap-4 text-xs font-semibold text-[#D4500A] pt-4">
        <Link href="/privacy" className="hover:underline">Privacy Policy →</Link>
        <Link href="/terms" className="hover:underline">Terms of Service →</Link>
        <Link href="/support" className="hover:underline">Support Desk →</Link>
      </div>
    </div>
  );
}
