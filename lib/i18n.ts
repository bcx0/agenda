export type Locale = "fr" | "en";

export const translations = {
  // Navigation
  "nav.home": { fr: "Accueil", en: "Home" },
  "nav.book": { fr: "Prendre RDV", en: "Book" },
  "nav.myBookings": { fr: "Mes RDV", en: "My Bookings" },
  "nav.dashboard": { fr: "Dashboard", en: "Dashboard" },
  "nav.agenda": { fr: "Agenda", en: "Agenda" },
  "nav.clients": { fr: "Clients", en: "Clients" },
  "nav.bookings": { fr: "Rendez-vous", en: "Bookings" },
  "nav.settings": { fr: "Paramètres", en: "Settings" },
  "nav.clientArea": { fr: "Espace Client", en: "Client Area" },
  "nav.adminAgenda": { fr: "Admin Agenda", en: "Admin Agenda" },

  // Status
  "status.confirmed": { fr: "Confirmé", en: "Confirmed" },
  "status.cancelled": { fr: "Annulé", en: "Cancelled" },
  "status.noShow": { fr: "Absent", en: "No Show" },
  "status.done": { fr: "Terminé", en: "Done" },
  "status.available": { fr: "Disponible", en: "Available" },
  "status.booked": { fr: "Réservé", en: "Booked" },
  "status.blocked": { fr: "Bloqué", en: "Blocked" },

  // Slot short
  "slot.available": { fr: "Dispo", en: "Avail." },
  "slot.booked": { fr: "Réservé", en: "Booked" },
  "slot.blocked": { fr: "Bloqué", en: "Blocked" },

  // Mode
  "mode.visio": { fr: "Visio", en: "Online" },
  "mode.presentiel": { fr: "Présentiel", en: "In-person" },

  // Dashboard
  "dashboard.title": { fr: "Administration", en: "Administration" },
  "dashboard.subtitle": { fr: "Vue rapide des clients et rendez-vous.", en: "Quick overview of clients and bookings." },
  "dashboard.activeClients": { fr: "Clients actifs", en: "Active clients" },
  "dashboard.appointments": { fr: "Rendez-vous", en: "Appointments" },
  "dashboard.recentBookings": { fr: "Rendez-vous récents", en: "Recent bookings" },
  "dashboard.viewAll": { fr: "Voir tout", en: "View all" },
  "dashboard.quickActions": { fr: "Actions rapides", en: "Quick actions" },
  "dashboard.viewAgenda": { fr: "Voir l'agenda", en: "View agenda" },
  "dashboard.manageClients": { fr: "Gérer les clients", en: "Manage clients" },
  "dashboard.manageBookings": { fr: "Gérer les rendez-vous", en: "Manage bookings" },
  "dashboard.noBookings": { fr: "Aucun rendez-vous.", en: "No bookings." },
  "dashboard.logout": { fr: "Se déconnecter", en: "Log out" },

  // Bookings
  "bookings.title": { fr: "Rendez-vous", en: "Bookings" },
  "bookings.subtitle": { fr: "Tous les rendez-vous à venir sont affichés. L'admin peut modifier ou annuler même à moins de 72h.", en: "All upcoming bookings are displayed. Admin can modify or cancel even within 72h." },
  "bookings.search": { fr: "Rechercher un client par nom ou email...", en: "Search client by name or email..." },
  "bookings.results": { fr: "résultat", en: "result" },
  "bookings.noResults": { fr: "Aucun rendez-vous trouvé.", en: "No bookings found." },
  "bookings.noBookings": { fr: "Aucune réservation.", en: "No bookings." },
  "bookings.viewDetails": { fr: "Voir les détails", en: "View details" },
  "bookings.modify": { fr: "Modifier", en: "Modify" },
  "bookings.cancel": { fr: "Annuler", en: "Cancel" },
  "bookings.reason": { fr: "Motif (optionnel)", en: "Reason (optional)" },
  "bookings.date": { fr: "Date", en: "Date" },
  "bookings.mode": { fr: "Mode", en: "Mode" },
  "bookings.cancelReason": { fr: "Raison annulation", en: "Cancel reason" },

  // Clients
  "clients.title": { fr: "Clients", en: "Clients" },
  "clients.addClient": { fr: "Ajouter un client", en: "Add client" },
  "clients.clientList": { fr: "Liste des clients", en: "Client list" },
  "clients.search": { fr: "Rechercher un client par nom ou email...", en: "Search client by name or email..." },
  "clients.noClient": { fr: "Aucun client trouvé.", en: "No client found." },
  "clients.rdvPerMonth": { fr: "RDV/mois", en: "Bookings/month" },
  "clients.rdvUsed": { fr: "RDV utilisés ce mois-ci", en: "bookings used this month" },
  "clients.rdv": { fr: "RDV", en: "Bookings" },
  "clients.active": { fr: "Actif", en: "Active" },
  "clients.inactive": { fr: "Inactif", en: "Inactive" },
  "clients.activate": { fr: "Activer", en: "Activate" },
  "clients.deactivate": { fr: "Désactiver", en: "Deactivate" },
  "clients.viewRdv": { fr: "Voir RDV", en: "View bookings" },
  "clients.update": { fr: "Mettre à jour", en: "Update" },
  "clients.add": { fr: "Ajouter", en: "Add" },
  "clients.delete": { fr: "Supprimer", en: "Delete" },
  "clients.deleteConfirm": { fr: "Supprimer ce client ?", en: "Delete this client?" },
  "clients.deleteWarning": { fr: "Tous ses rendez-vous seront également supprimés. Cette action est irréversible.", en: "All bookings will also be deleted. This action is irreversible." },

  // Availability
  "availability.noSlot": { fr: "Aucun créneau", en: "No slot" },
  "availability.today": { fr: "Aujourd'hui", en: "Today" },
  "availability.close": { fr: "Fermer", en: "Close" },
  "availability.availabilities": { fr: "Disponibilités", en: "Availabilities" },
  "availability.noAvailability": { fr: "Aucune disponibilité", en: "No availability" },
  "availability.reservations": { fr: "Réservations", en: "Reservations" },
  "availability.noReservation": { fr: "Aucune réservation", en: "No reservation" },
  "availability.summary": { fr: "Récapitulatif du", en: "Summary for" },
  "availability.clickDay": { fr: "Cliquez sur un jour du calendrier pour voir le récapitulatif.", en: "Click a day on the calendar to see the summary." },

  // Calendar legend
  "legend.available": { fr: "Disponible", en: "Available" },
  "legend.booked": { fr: "Réservé", en: "Booked" },
  "legend.blocked": { fr: "Bloqué", en: "Blocked" },
  "legend.miami": { fr: "Miami", en: "Miami" },
  "legend.belgium": { fr: "Belgique", en: "Belgium" },
  "legend.unavailable": { fr: "Indisponible", en: "Unavailable" },

  // Book page
  "book.title": { fr: "Prendre rendez-vous", en: "Book an appointment" },
  "book.monthlyRdv": { fr: "Vos RDV mensuels", en: "Your monthly bookings" },
  "book.usedThisMonth": { fr: "utilisés ce mois-ci", en: "used this month" },
  "book.blocked": { fr: "Les RDV sont bloqués après le quota mensuel. Pour un besoin exceptionnel, contactez Geoffrey.", en: "Bookings are blocked after the monthly quota. For exceptional needs, contact Geoffrey." },
  "book.disconnect": { fr: "Déconnexion", en: "Log out" },

  // Settings
  "settings.title": { fr: "Paramètres", en: "Settings" },
  "settings.subtitle": { fr: "Configuration des localisations, horaires et synchronisation.", en: "Locations, schedules and sync configuration." },
  "settings.save": { fr: "Enregistrer", en: "Save" },

  // Common
  "common.admin": { fr: "Admin", en: "Admin" },
  "common.name": { fr: "Nom", en: "Name" },
  "common.email": { fr: "Email", en: "Email" },
  "common.password": { fr: "Mot de passe", en: "Password" },
  "common.viaGoogle": { fr: "via Google", en: "via Google" },
  "common.cancel": { fr: "Annuler", en: "Cancel" },
  "common.back": { fr: "Retour", en: "Back" },

  // Login
  "login.title": { fr: "Espace client", en: "Client area" },
  "login.secureLogin": { fr: "Connexion sécurisée", en: "Secure login" },
  "login.quote": { fr: "Une page privée, simple et claire pour réserver vos sessions.", en: "A private, simple and clear page to book your sessions." },
  "login.verify": { fr: "Vérification par email + mot de passe.", en: "Email + password verification." },
  "login.quota": { fr: "Quotas mensuels pris en compte automatiquement.", en: "Monthly quotas automatically taken into account." },
  "login.realtime": { fr: "Créneaux Belgique / Miami affichés en temps réel.", en: "Belgium / Miami slots displayed in real time." },

  // Footer
  "footer.madeBy": { fr: "Réalisé par", en: "Made by" },
  "footer.agency": { fr: "L'agence", en: "The Agency" },
} as const;

export type TranslationKey = keyof typeof translations;

export function t(key: TranslationKey, locale: Locale): string {
  const entry = translations[key];
  if (!entry) return key;
  return entry[locale] ?? entry["fr"];
}

export function translateStatus(status: string, locale: Locale): string {
  const map: Record<string, TranslationKey> = {
    CONFIRMED: "status.confirmed",
    CANCELLED: "status.cancelled",
    NO_SHOW: "status.noShow",
    DONE: "status.done",
    available: "status.available",
    booked: "status.booked",
    blocked: "status.blocked",
  };
  const key = map[status];
  return key ? t(key, locale) : status;
}

export function translateSlotStatus(status: string, locale: Locale): string {
  const map: Record<string, TranslationKey> = {
    available: "slot.available",
    booked: "slot.booked",
    blocked: "slot.blocked",
  };
  const key = map[status];
  return key ? t(key, locale) : status;
}

export function translateMode(mode: string, locale: Locale): string {
  if (mode === "VISIO") return t("mode.visio", locale);
  if (mode === "PRESENTIEL") return t("mode.presentiel", locale);
  return mode;
}

export const COOKIE_NAME = "lang";
export const DEFAULT_LOCALE: Locale = "fr";
