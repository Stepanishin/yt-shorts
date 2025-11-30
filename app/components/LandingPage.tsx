"use client";

import Link from "next/link";
import { useSession, signIn } from "next-auth/react";
import { useLanguage } from "../contexts/LanguageContext";

export default function LandingPage() {
  const { t } = useLanguage();
  const { data: session } = useSession();

  // Обработчик для кнопок CTA
  const handleCTA = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (!session) {
      e.preventDefault();
      signIn("google");
    }
    // Если залогинен, ссылка сработает как обычно и перейдет на /dashboard
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
      {/* Hero Section */}
      <section className="container mx-auto px-4 py-20 max-w-6xl">
        <div className="text-center">
          <div className="mb-6 flex justify-center">
            <div className="text-6xl">🎬</div>
          </div>
          <h1 className="text-5xl md:text-6xl font-bold text-gray-900 mb-6">
            {t("landing.hero.title")}
          </h1>
          <p className="text-xl text-gray-800 mb-10 max-w-3xl mx-auto">
            {t("landing.hero.subtitle")}
          </p>
          <div className="flex justify-center">
            <Link
              href="/dashboard"
              onClick={handleCTA}
              className="px-8 py-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-semibold text-lg shadow-lg hover:shadow-xl"
            >
              {t("landing.hero.cta")}
            </Link>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="container mx-auto px-4 py-20 max-w-6xl">
        <h2 className="text-4xl font-bold text-center text-gray-900 mb-16">
          {t("landing.features.title")}
        </h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
          <div className="bg-white p-8 rounded-xl shadow-md hover:shadow-lg transition-shadow">
            <div className="text-4xl mb-4">⚡</div>
            <h3 className="text-xl font-bold text-gray-900 mb-3">
              {t("landing.features.automation.title")}
            </h3>
            <p className="text-gray-800">
              {t("landing.features.automation.description")}
            </p>
          </div>

          <div className="bg-white p-8 rounded-xl shadow-md hover:shadow-lg transition-shadow">
            <div className="text-4xl mb-4">✨</div>
            <h3 className="text-xl font-bold text-gray-900 mb-3">
              {t("landing.features.quality.title")}
            </h3>
            <p className="text-gray-800">
              {t("landing.features.quality.description")}
            </p>
          </div>

          <div className="bg-white p-8 rounded-xl shadow-md hover:shadow-lg transition-shadow">
            <div className="text-4xl mb-4">📺</div>
            <h3 className="text-xl font-bold text-gray-900 mb-3">
              {t("landing.features.youtube.title")}
            </h3>
            <p className="text-gray-800">
              {t("landing.features.youtube.description")}
            </p>
          </div>

          <div className="bg-white p-8 rounded-xl shadow-md hover:shadow-lg transition-shadow">
            <div className="text-4xl mb-4">🎨</div>
            <h3 className="text-xl font-bold text-gray-900 mb-3">
              {t("landing.features.customization.title")}
            </h3>
            <p className="text-gray-800">
              {t("landing.features.customization.description")}
            </p>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="bg-gray-50 py-20">
        <div className="container mx-auto px-4 max-w-6xl">
          <h2 className="text-4xl font-bold text-center text-gray-900 mb-16">
            {t("landing.howItWorks.title")}
          </h2>
          <div className="grid md:grid-cols-3 gap-12">
            <div className="text-center">
              <div className="bg-blue-600 text-white rounded-full w-16 h-16 flex items-center justify-center text-2xl font-bold mx-auto mb-6">
                1
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-4">
                {t("landing.howItWorks.step1.title")}
              </h3>
              <p className="text-gray-800">
                {t("landing.howItWorks.step1.description")}
              </p>
            </div>

            <div className="text-center">
              <div className="bg-blue-600 text-white rounded-full w-16 h-16 flex items-center justify-center text-2xl font-bold mx-auto mb-6">
                2
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-4">
                {t("landing.howItWorks.step2.title")}
              </h3>
              <p className="text-gray-800">
                {t("landing.howItWorks.step2.description")}
              </p>
            </div>

            <div className="text-center">
              <div className="bg-blue-600 text-white rounded-full w-16 h-16 flex items-center justify-center text-2xl font-bold mx-auto mb-6">
                3
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-4">
                {t("landing.howItWorks.step3.title")}
              </h3>
              <p className="text-gray-800">
                {t("landing.howItWorks.step3.description")}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="container mx-auto px-4 py-20 max-w-4xl">
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-2xl p-12 text-center shadow-2xl">
          <h2 className="text-4xl font-bold text-white mb-4">
            {t("landing.cta.title")}
          </h2>
          <p className="text-xl text-blue-100 mb-8">
            {t("landing.cta.subtitle")}
          </p>
          <Link
            href="/dashboard"
            onClick={handleCTA}
            className="inline-block px-10 py-4 bg-white text-blue-600 rounded-lg hover:bg-gray-100 transition-colors font-semibold text-lg shadow-lg hover:shadow-xl"
          >
            {t("landing.cta.button")}
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-300 py-8">
        <div className="container mx-auto px-4 text-center text-gray-800">
          <p>
            {t("landing.footer.madeWith")} ❤️ {t("landing.footer.by")} Shorts Generator
          </p>
        </div>
      </footer>
    </div>
  );
}
