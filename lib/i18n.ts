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
  "book.creditsRemaining": { fr: "crédits restants", en: "credits remaining" },
  "book.creditRemaining": { fr: "crédit restant", en: "credit remaining" },
  "book.noCredits": { fr: "aucun crédit", en: "no credits" },
  "book.yourCredits": { fr: "Vos crédits", en: "Your credits" },
  "book.inMonth": { fr: "En", en: "In" },

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
  "footer.legal": { fr: "Mentions légales", en: "Legal notice" },
  "footer.followUs": { fr: "Suivez-nous", en: "Follow us" },

  // Admin login
  "adminLogin.title": { fr: "Connexion requise", en: "Login required" },
  "adminLogin.pill": { fr: "Espace Admin", en: "Admin Area" },
  "adminLogin.desc": { fr: "Protégé par mot de passe (.env ADMIN_PASSWORD). Aucune notification n'est envoyée automatiquement.", en: "Password protected (.env ADMIN_PASSWORD). No automatic notifications are sent." },
  "adminLogin.password": { fr: "Mot de passe admin", en: "Admin password" },
  "adminLogin.placeholder": { fr: "Mot de passe", en: "Password" },
  "adminLogin.submit": { fr: "Se connecter", en: "Log in" },

  // Booking detail
  "bookingDetail.title": { fr: "Modifier le rendez-vous", en: "Edit booking" },
  "bookingDetail.backToAvailability": { fr: "Retour aux disponibilités", en: "Back to availability" },
  "bookingDetail.currentInfo": { fr: "Informations actuelles", en: "Current information" },
  "bookingDetail.client": { fr: "Client", en: "Client" },
  "bookingDetail.date": { fr: "Date", en: "Date" },
  "bookingDetail.mode": { fr: "Mode", en: "Mode" },
  "bookingDetail.status": { fr: "Statut", en: "Status" },
  "bookingDetail.notes": { fr: "Notes", en: "Notes" },
  "bookingDetail.modify": { fr: "Modifier", en: "Modify" },
  "bookingDetail.newSlot": { fr: "Nouveau créneau", en: "New slot" },
  "bookingDetail.notesOptional": { fr: "Notes (optionnel)", en: "Notes (optional)" },
  "bookingDetail.reason": { fr: "Motif (optionnel)", en: "Reason (optional)" },
  "bookingDetail.save": { fr: "Enregistrer les modifications", en: "Save changes" },
  "bookingDetail.dangerZone": { fr: "Zone de danger", en: "Danger zone" },
  "bookingDetail.cancelDesc": { fr: "Annuler ce rendez-vous rendra le créneau à nouveau disponible.", en: "Cancelling this booking will make the slot available again." },
  "bookingDetail.cancelBooking": { fr: "Annuler ce rendez-vous", en: "Cancel this booking" },

  // Client bookings
  "clientBookings.bookingsOf": { fr: "Rendez-vous de", en: "Bookings for" },
  "clientBookings.backToClients": { fr: "Retour aux clients", en: "Back to clients" },
  "clientBookings.noBookings": { fr: "Aucun rendez-vous pour ce client", en: "No bookings for this client" },
  "clientBookings.bookFor": { fr: "Réserver un RDV pour ce client", en: "Book for this client" },
  "clientBookings.modify": { fr: "Modifier", en: "Modify" },

  // Settings page
  "settings.config": { fr: "Configuration", en: "Configuration" },
  "settings.defaultModeAndLocation": { fr: "Mode par défaut et lieu présentiel", en: "Default mode and in-person location" },
  "settings.defaultMode": { fr: "Mode par défaut", en: "Default mode" },
  "settings.presentielLocation": { fr: "Lieu présentiel", en: "In-person location" },
  "settings.presentielNote": { fr: "Note présentiel", en: "In-person note" },
  "settings.baseMiami": { fr: "Base — Miami", en: "Base — Miami" },
  "settings.hoursByDay": { fr: "Horaires par jour de la semaine", en: "Hours by day of week" },
  "settings.belgium": { fr: "Belgique", en: "Belgium" },
  "settings.belgiumStays": { fr: "Séjours en Belgique", en: "Belgium stays" },
  "settings.whenInBelgium": { fr: "Quand Geoffrey est en Belgique", en: "When Geoffrey is in Belgium" },
  "settings.belgiumDesc": { fr: "Pendant ces périodes, les horaires Belgique remplacent les horaires Miami. Les créneaux Miami disparaissent pour les clients.", en: "During these periods, Belgium hours replace Miami hours. Miami slots disappear for clients." },
  "settings.startDate": { fr: "Date de début", en: "Start date" },
  "settings.endDate": { fr: "Date de fin", en: "End date" },
  "settings.noteOptional": { fr: "Note (optionnel)", en: "Note (optional)" },
  "settings.addPeriod": { fr: "Ajouter cette période", en: "Add this period" },
  "settings.active": { fr: "EN COURS", en: "ACTIVE" },
  "settings.noPeriod": { fr: "Aucune période configurée. Les horaires Miami s'appliquent par défaut.", en: "No period configured. Miami hours apply by default." },
  "settings.delete": { fr: "Supprimer", en: "Delete" },
  "settings.googleCalendar": { fr: "Google Calendar", en: "Google Calendar" },
  "settings.connectionAndSync": { fr: "Connexion et synchronisation", en: "Connection and sync" },
  "settings.sessionModes": { fr: "Modes de session par période", en: "Session modes by period" },
  "settings.sessionModesDesc": { fr: "Définissez des plages de dates avec un mode spécifique (Visio ou Présentiel).", en: "Define date ranges with a specific mode (Online or In-person)." },
  "settings.addRange": { fr: "Ajouter cette plage", en: "Add this range" },
  "settings.configuredRanges": { fr: "Plages configurées", en: "Configured ranges" },
  "settings.noRange": { fr: "Aucune plage configurée. Le mode par défaut reste appliqué.", en: "No range configured. Default mode remains applied." },
  "settings.from": { fr: "Du", en: "From" },
  "settings.to": { fr: "au", en: "to" },
  "settings.noHours": { fr: "Aucun horaire configuré.", en: "No hours configured." },
  "settings.miamiDefault": { fr: "Les horaires par défaut (7h–21h) seront utilisés.", en: "Default hours (7am–9pm) will be used." },
  "settings.belgiumDefault": { fr: "Les horaires par défaut (9h–19h) seront utilisés.", en: "Default hours (9am–7pm) will be used." },
  "settings.day": { fr: "Jour", en: "Day" },
  "settings.start": { fr: "Début", en: "Start" },
  "settings.end": { fr: "Fin", en: "End" },
  "settings.addBtn": { fr: "+ Ajouter", en: "+ Add" },
  "settings.visio": { fr: "Visio", en: "Online" },
  "settings.presentiel": { fr: "Présentiel", en: "In-person" },
  "settings.selectMode": { fr: "Sélectionner un mode", en: "Select a mode" },
  "settings.onlineVisio": { fr: "En ligne (Visio)", en: "Online (Video)" },
  "settings.onSite": { fr: "Sur place (Présentiel)", en: "On-site (In-person)" },
  "settings.addressIfPresentiel": { fr: "Adresse (si présentiel)", en: "Address (if in-person)" },

  // Availability page (server)
  "avail.title": { fr: "Disponibilités", en: "Availability" },
  "avail.subtitle": { fr: "Gérez les créneaux, les rendez-vous et les blocages.", en: "Manage slots, bookings and blocks." },

  // iCal
  "ical.title": { fr: "S'abonner au calendrier Apple", en: "Subscribe to Apple Calendar" },
  "ical.url": { fr: "URL du flux iCal:", en: "iCal feed URL:" },
  "ical.step1": { fr: "iPhone : Réglages → Calendrier → Comptes", en: "iPhone: Settings → Calendar → Accounts" },
  "ical.step2": { fr: "Ajouter un compte → Autre → S'abonner à un calendrier", en: "Add Account → Other → Subscribe to a Calendar" },
  "ical.step3": { fr: "Coller l'URL ci-dessus puis valider", en: "Paste the URL above and confirm" },
  "ical.step4": { fr: "Les réservations confirmées futures se synchronisent automatiquement", en: "Future confirmed bookings sync automatically" },

  // Book (client)
  "book.pill": { fr: "Espace client", en: "Client area" },
  "book.subtitle": { fr: "Les créneaux occupés restent anonymes. Aucun rappel automatique ne sera envoyé.", en: "Occupied slots remain anonymous. No automatic reminders will be sent." },
  "book.myRdv": { fr: "Mes RDV", en: "My bookings" },

  // Manage (client)
  "manage.title": { fr: "Mes rendez-vous", en: "My bookings" },
  "manage.pill": { fr: "Espace client", en: "Client area" },
  "manage.noBookings": { fr: "Aucun rendez-vous à venir.", en: "No upcoming bookings." },
  "manage.reschedule": { fr: "Modifier", en: "Reschedule" },
  "manage.cancelBooking": { fr: "Annuler ce RDV", en: "Cancel this booking" },

  // RDV manage (token)
  "rdvManage.title": { fr: "Gérer votre rendez-vous", en: "Manage your booking" },
  "rdvManage.currentSlot": { fr: "Créneau actuel", en: "Current slot" },
  "rdvManage.status": { fr: "Statut", en: "Status" },
  "rdvManage.alreadyCancelled": { fr: "Ce rendez-vous est déjà annulé. Pour reprogrammer un nouveau rendez-vous, contactez votre interlocuteur.", en: "This booking is already cancelled. To reschedule, contact your representative." },
  "rdvManage.cancel": { fr: "Annuler", en: "Cancel" },
  "rdvManage.cancelDesc": { fr: "Merci d'indiquer le motif de l'annulation.", en: "Please indicate the reason for cancellation." },
  "rdvManage.confirmCancel": { fr: "Confirmer l'annulation", en: "Confirm cancellation" },
  "rdvManage.modify": { fr: "Modifier", en: "Modify" },
  "rdvManage.modifyDesc": { fr: "Choisissez un nouveau créneau disponible.", en: "Choose a new available slot." },
  "rdvManage.newSlot": { fr: "Nouveau créneau", en: "New slot" },
  "rdvManage.selectSlot": { fr: "Sélectionner un créneau", en: "Select a slot" },
  "rdvManage.confirmModify": { fr: "Confirmer la modification", en: "Confirm modification" },

  // SlotButton
  "slotButton.visio": { fr: "Visio", en: "Online" },
  "slotButton.presentiel": { fr: "Présentiel", en: "In-person" },
  "slotButton.belgium": { fr: "Belgique", en: "Belgium" },
  "slotButton.book": { fr: "Réserver ce créneau", en: "Book this slot" },
  "slotButton.confirm": { fr: "Confirmer la réservation ?", en: "Confirm booking?" },
  "slotButton.confirmBtn": { fr: "Oui, confirmer", en: "Yes, confirm" },
  "slotButton.cancelBtn": { fr: "Annuler", en: "Cancel" },
  "slotButton.quotaReached": { fr: "Quota atteint", en: "Quota reached" },
  "slotButton.occupied": { fr: "Occupé", en: "Occupied" },
  "slotButton.available": { fr: "Disponible", en: "Available" },
  "slotButton.unavailable": { fr: "Indisponible", en: "Unavailable" },
  "slotButton.reserving": { fr: "Réservation...", en: "Booking..." },
  "slotButton.confirmQ": { fr: "Confirmer ?", en: "Confirm?" },

  // Booking lock
  "dashboard.bookingLocked": { fr: "Réservations bloquées", en: "Bookings locked" },
  "dashboard.bookingUnlocked": { fr: "Réservations ouvertes", en: "Bookings open" },
  "dashboard.toggleLock": { fr: "Bloquer/Débloquer les réservations", en: "Lock/Unlock bookings" },
  "book.locked": { fr: "Les réservations sont temporairement suspendues. Veuillez réessayer plus tard.", en: "Bookings are temporarily suspended. Please try again later." },

  // Availability page tabs
  "avail.tabAgenda": { fr: "Agenda", en: "Agenda" },
  "avail.tabWeekly": { fr: "Mes horaires fixes", en: "My fixed hours" },
  "avail.tabSingleBlock": { fr: "Réserver un RDV", en: "Book an appointment" },
  "avail.tabRecurring": { fr: "RDV réguliers", en: "Recurring bookings" },
  "avail.tabOverrides": { fr: "RDV bloqués", en: "Blocked bookings" },
  "avail.calendarView": { fr: "Vue calendrier Brussels / Miami. Gérez vos créneaux et rendez-vous.", en: "Calendar view Brussels / Miami. Manage your slots and bookings." },

  // Weekly tab
  "avail.myFixedHours": { fr: "Mes horaires fixes", en: "My fixed hours" },
  "avail.addRule": { fr: "Ajouter", en: "Add" },
  "avail.noRule": { fr: "Aucune règle définie. Les créneaux retombent sur la plage par défaut tant que vous n'en créez pas.", en: "No rule defined. Slots fall back to default range until you create one." },
  "avail.existingRules": { fr: "Règles existantes", en: "Existing rules" },
  "avail.noRuleShort": { fr: "Aucune règle.", en: "No rules." },
  "avail.delete": { fr: "Supprimer", en: "Delete" },

  // Single block tab
  "avail.bookRdv": { fr: "Réserver un RDV", en: "Book an appointment" },
  "avail.client": { fr: "Client", en: "Client" },
  "avail.selectClient": { fr: "Selectionner un client", en: "Select a client" },
  "avail.rdvRemaining": { fr: "RDV restants", en: "bookings remaining" },
  "avail.date": { fr: "Date", en: "Date" },
  "avail.startTime": { fr: "Heure de début", en: "Start time" },
  "avail.endTime": { fr: "Heure de fin", en: "End time" },
  "avail.select": { fr: "Sélectionner", en: "Select" },
  "avail.notesOptional": { fr: "Notes (optionnel)", en: "Notes (optional)" },
  "avail.noteInternalPlaceholder": { fr: "Note interne (optionnel)", en: "Internal note (optional)" },
  "avail.blockSlot": { fr: "BLOQUER CE CRENEAU", en: "BLOCK THIS SLOT" },
  "avail.upcomingBlocked": { fr: "Prochaines dates bloquees", en: "Upcoming blocked dates" },
  "avail.noBlocked": { fr: "Aucune date bloquee.", en: "No blocked dates." },
  "avail.cancelBtn": { fr: "Annuler", en: "Cancel" },

  // Overrides tab
  "avail.blockedRdv": { fr: "RDV bloqués", en: "Blocked bookings" },
  "avail.startHour": { fr: "Heure de début", en: "Start hour" },
  "avail.endHour": { fr: "Heure de fin", en: "End hour" },
  "avail.block": { fr: "Bloquer", en: "Block" },
  "avail.open": { fr: "Ouvrir", en: "Open" },
  "avail.noteOptional": { fr: "Note (optionnel)", en: "Note (optional)" },
  "avail.add": { fr: "Ajouter", en: "Add" },
  "avail.existingExceptions": { fr: "Exceptions existantes", en: "Existing exceptions" },
  "avail.noException": { fr: "Aucune exception.", en: "No exceptions." },
  "avail.opening": { fr: "Ouverture", en: "Opening" },
  "avail.blocking": { fr: "Blocage", en: "Blocking" },
  "avail.note": { fr: "Note", en: "Note" },
  "avail.legacyBlocks": { fr: "Blocages hérités", en: "Legacy blocks" },
  "avail.reason": { fr: "Raison", en: "Reason" },

  // Recurring tab
  "avail.recurringRdv": { fr: "RDV réguliers", en: "Recurring bookings" },
  "avail.selectHour": { fr: "Sélectionner une heure", en: "Select a time" },
  "avail.noClient": { fr: "Aucun client", en: "No client" },
  "avail.reservedForPlaceholder": { fr: "Réservé pour… (optionnel)", en: "Reserved for… (optional)" },
  "avail.existingRecurring": { fr: "Blocs récurrents existants", en: "Existing recurring blocks" },
  "avail.noRecurring": { fr: "Aucun bloc récurrent.", en: "No recurring blocks." },
  "avail.clientAssigned": { fr: "Client", en: "Client" },
  "avail.noClientAssigned": { fr: "Client non attribué", en: "No client assigned" },

  // Manage page
  "manage.modify": { fr: "Modifier", en: "Reschedule" },
  "manage.cancel": { fr: "Annuler", en: "Cancel" },
  "manage.noModify": { fr: "Modification impossible (moins de 72h)", en: "Cannot modify (less than 72h before)" },
  "manage.noBookings2": { fr: "Aucun rendez-vous.", en: "No bookings." },

  // RDV manage page
  "rdvManage.expired": { fr: "Lien expiré", en: "Link expired" },
  "rdvManage.expiredDesc": { fr: "Ce lien de gestion n'est plus valide. Contactez votre interlocuteur pour obtenir un nouveau lien.", en: "This management link is no longer valid. Contact your representative for a new link." },
  "rdvManage.refFor": { fr: "Référence pour", en: "Reference for" },
  "rdvManage.cancelled": { fr: "Votre rendez-vous a été annulé.", en: "Your booking has been cancelled." },
  "rdvManage.rescheduled": { fr: "Votre rendez-vous a été modifié.", en: "Your booking has been modified." },
  "rdvManage.cancelReason": { fr: "Motif d'annulation", en: "Cancellation reason" },
  "rdvManage.rescheduleReason": { fr: "Motif de modification", en: "Modification reason" },
  "rdvManage.noSlotAvailable": { fr: "Aucun créneau disponible pour le moment.", en: "No slots available at the moment." },

  // Book page extra
  "book.confirmed": { fr: "Rendez-vous confirmé.", en: "Booking confirmed." },
  "book.quotaWarning": { fr: "Quota mensuel atteint. Contactez Geoffrey si vous avez besoin d'un créneau supplémentaire.", en: "Monthly quota reached. Contact Geoffrey if you need an additional slot." },

  // Calendar day names
  "day.mon": { fr: "Lun", en: "Mon" },
  "day.tue": { fr: "Mar", en: "Tue" },
  "day.wed": { fr: "Mer", en: "Wed" },
  "day.thu": { fr: "Jeu", en: "Thu" },
  "day.fri": { fr: "Ven", en: "Fri" },
  "day.sat": { fr: "Sam", en: "Sat" },
  "day.sun": { fr: "Dim", en: "Sun" },
  "calendar.today": { fr: "Aujourd'hui", en: "Today" },
  "calendar.available1": { fr: "1 disponibilité", en: "1 available" },
  "calendar.availableN": { fr: "disponibilités", en: "available" },
  "calendar.full": { fr: "Complet", en: "Full" },
  "calendar.busy": { fr: "Occupé", en: "Busy" },
  "calendar.noSlot": { fr: "Aucun créneau", en: "No slot" },
  "calendar.selectDay": { fr: "Sélectionner le", en: "Select" },

  // Settings day names
  "dayName.1": { fr: "Lundi", en: "Monday" },
  "dayName.2": { fr: "Mardi", en: "Tuesday" },
  "dayName.3": { fr: "Mercredi", en: "Wednesday" },
  "dayName.4": { fr: "Jeudi", en: "Thursday" },
  "dayName.5": { fr: "Vendredi", en: "Friday" },
  "dayName.6": { fr: "Samedi", en: "Saturday" },
  "dayName.7": { fr: "Dimanche", en: "Sunday" },

  // Month names
  "month.1": { fr: "janvier", en: "January" },
  "month.2": { fr: "février", en: "February" },
  "month.3": { fr: "mars", en: "March" },
  "month.4": { fr: "avril", en: "April" },
  "month.5": { fr: "mai", en: "May" },
  "month.6": { fr: "juin", en: "June" },
  "month.7": { fr: "juillet", en: "July" },
  "month.8": { fr: "août", en: "August" },
  "month.9": { fr: "septembre", en: "September" },
  "month.10": { fr: "octobre", en: "October" },
  "month.11": { fr: "novembre", en: "November" },
  "month.12": { fr: "décembre", en: "December" },

  // BookingViews
  "bookingViews.brusselsMiami": { fr: "Brussels / Miami", en: "Brussels / Miami" },
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

/** Server-side helper — call from server components / route handlers */
export async function getServerLocale(): Promise<Locale> {
  const { cookies } = await import("next/headers");
  const jar = await cookies();
  const val = jar.get(COOKIE_NAME)?.value;
  if (val === "en" || val === "fr") return val;
  return DEFAULT_LOCALE;
}
