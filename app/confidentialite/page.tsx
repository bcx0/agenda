import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Politique de confidentialité — Geoffrey Mahieu",
  description:
    "Politique de confidentialité de l'espace client de Geoffrey Mahieu, coach mental : données collectées, usage des données Google Calendar, droits des utilisateurs."
};

/**
 * Page exigée par la vérification OAuth Google (scopes Calendar) : elle doit
 * être accessible publiquement sur le domaine de l'app et décrire l'usage des
 * données Google, y compris la déclaration "Limited Use".
 * Style : conventions des pages publiques (fond clair, secondaire #5A6B76).
 */
export default function ConfidentialitePage() {
  return (
    <section className="mx-auto max-w-3xl space-y-8 px-5 py-14 md:py-20">
      <div className="space-y-2">
        <p className="pill w-fit">Espace client</p>
        <h1 className="font-[var(--font-playfair)] text-3xl uppercase tracking-wider">
          Politique de confidentialité
        </h1>
        <p className="text-sm text-[#5A6B76]">Dernière mise à jour : 17 juillet 2026</p>
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Qui sommes-nous</h2>
        <p className="text-[#5A6B76]">
          Ce site est l&apos;espace de prise de rendez-vous de Geoffrey Mahieu, coach mental
          (« l&apos;Application »). Il permet aux clients sous contrat de réserver, déplacer et
          annuler leurs séances. Responsable du traitement : Geoffrey Mahieu. Contact :{" "}
          <a href="mailto:gmcalpro@gmail.com" className="text-primary underline">
            gmcalpro@gmail.com
          </a>
          .
        </p>
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Données collectées</h2>
        <p className="text-[#5A6B76]">
          Pour les clients : nom, adresse e-mail, historique de rendez-vous et préférences de
          session (visio ou présentiel). Ces données servent uniquement à la gestion des
          rendez-vous et à la communication liée aux séances (confirmations, rappels,
          annulations). Elles ne sont ni vendues, ni louées, ni partagées avec des tiers à des
          fins commerciales.
        </p>
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Données Google Calendar (Google user data)</h2>
        <p className="text-[#5A6B76]">
          Avec l&apos;autorisation explicite du professionnel (compte Google connecté),
          l&apos;Application accède à son agenda Google via l&apos;API Google Calendar
          (portées&nbsp;: <code>calendar</code> et <code>calendar.events</code>) pour :
        </p>
        <ul className="list-disc space-y-1 pl-6 text-[#5A6B76]">
          <li>
            créer, modifier et supprimer les événements correspondant aux rendez-vous pris dans
            l&apos;Application ;
          </li>
          <li>
            lire les événements de l&apos;agenda afin d&apos;afficher les disponibilités
            réelles et d&apos;éviter les doubles réservations.
          </li>
        </ul>
        <p className="text-[#5A6B76]">
          Les données d&apos;agenda sont utilisées exclusivement pour cette synchronisation
          bidirectionnelle. Elles ne sont pas utilisées à des fins publicitaires, ne sont pas
          vendues et ne sont pas transférées à des tiers, sauf lorsque c&apos;est nécessaire au
          fonctionnement du service (hébergement) ou exigé par la loi. Aucun humain ne lit ces
          données, sauf demande d&apos;assistance explicite du professionnel ou obligation
          légale.
        </p>
        <p className="card p-4 text-sm text-[#5A6B76]">
          <strong>Limited Use disclosure (English).</strong> This application&apos;s use and
          transfer to any other app of information received from Google APIs will adhere to
          the{" "}
          <a
            href="https://developers.google.com/terms/api-services-user-data-policy"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline"
          >
            Google API Services User Data Policy
          </a>
          , including the Limited Use requirements. Google Calendar data is accessed solely to
          synchronize appointments between this booking application and the professional&apos;s
          calendar. It is never used for advertising, never sold, and never read by humans
          except with explicit consent, for security purposes, or to comply with applicable
          law.
        </p>
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Stockage et sécurité</h2>
        <p className="text-[#5A6B76]">
          Les données sont hébergées dans l&apos;Union européenne et aux États-Unis auprès de
          prestataires d&apos;hébergement (Vercel, Supabase). Les jetons d&apos;accès Google
          sont stockés de manière sécurisée et ne sont jamais exposés côté client. Les accès
          d&apos;administration sont protégés par authentification.
        </p>
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Conservation et suppression</h2>
        <p className="text-[#5A6B76]">
          Les données de rendez-vous sont conservées pendant la durée de la relation
          contractuelle. Le professionnel peut déconnecter son compte Google à tout moment
          depuis l&apos;administration (les jetons sont alors invalidés) et révoquer les accès
          sur{" "}
          <a
            href="https://myaccount.google.com/permissions"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline"
          >
            myaccount.google.com/permissions
          </a>
          . Tout client peut demander la consultation, la rectification ou la suppression de
          ses données en écrivant à l&apos;adresse de contact ci-dessus (droits RGPD).
        </p>
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Cookies</h2>
        <p className="text-[#5A6B76]">
          L&apos;Application utilise uniquement des cookies techniques nécessaires au
          fonctionnement (session de connexion, préférence de langue). Aucun cookie
          publicitaire ou de suivi tiers n&apos;est utilisé.
        </p>
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Modifications</h2>
        <p className="text-[#5A6B76]">
          Cette politique peut être mise à jour ; la date en haut de page fait foi. Les
          modifications substantielles concernant l&apos;usage des données Google seront
          signalées au professionnel avant leur entrée en vigueur.
        </p>
      </div>
    </section>
  );
}
