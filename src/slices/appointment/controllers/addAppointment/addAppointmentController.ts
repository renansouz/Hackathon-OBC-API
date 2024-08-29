import { google } from "googleapis";

import {
  addHours,
  badRequest,
  HttpRequest,
  HttpResponse,
  parseISO,
  success,
  Validation,
} from "@/application/helpers";
import { Controller } from "@/application/infra/contracts";
import { GoogleOAuthService } from "@/application/infra/oAuth";
import { AddAppointment, ValidateAvailableTimesSchema } from "@/slices/appointment/useCases";

export class AddAppointmentController extends Controller {
  constructor(
    private readonly validation: Validation,
    private readonly addAppointment: AddAppointment,
    private readonly validateAvailableTimes: ValidateAvailableTimesSchema,
    private readonly googleOAuthService: GoogleOAuthService,
  ) {
    super();
  }
  async execute(httpRequest: HttpRequest<any>): Promise<HttpResponse<any>> {
    const errors = this.validation.validate(httpRequest?.body);
    if (errors?.length > 0) {
      return badRequest(errors);
    }
  
    const appointmentIsValid = await this.validateAvailableTimes({
      date: httpRequest?.body?.initDate,
      initDate: httpRequest?.body?.initDate,
      endDate: httpRequest?.body?.endDate,
      professionalId: httpRequest?.body?.professionalId,
      scheduleId: httpRequest?.body?.scheduleId,
      serviceId: httpRequest?.body?.serviceId,
    });
    if (!appointmentIsValid) {
      return badRequest(errors);
    }
    const appointmentCreated = await this.addAppointment({
      ...httpRequest?.body,
      createdById: httpRequest?.userId,
    });

    if(httpRequest?.userId){
      // After creating the appointment, create a Google Calendar event
      const auth = await this.googleOAuthService.getGoogleOAuthToken(httpRequest?.userId);

      if (auth) {
        const calendar = google.calendar({ version: "v3", auth });
      
        const event = {
          summary: `Meet Flow: ${httpRequest?.body?.serviceName}`,
          description: httpRequest?.body?.message,
          start: {
            dateTime: addHours(parseISO(httpRequest?.body?.initDate), 3), // Adiciona 3 horas
            "timeZone": "America/Sao_Paulo", // Fuso horário do Brasil
          },
          end: {
            dateTime: addHours(parseISO(httpRequest?.body?.endDate), 3), // Adiciona 3 horas
            "timeZone": "America/Sao_Paulo", // Fuso horário do Brasil
          },
          attendees: [{ email: httpRequest?.body?.clientEmail, displayName: httpRequest?.body?.clientName }],
          conferenceData: {
            createRequest: {
              requestId: appointmentCreated?._id,
              conferenceSolutionKey: {
                type: "hangoutsMeet",
              },
            },
          },
        };

        await calendar.events.insert({
          calendarId: "primary",
          conferenceDataVersion: 1,
          requestBody: event,
        });
      }
    }

    return success(appointmentCreated);
  }
}

/* 
if(httpRequest?.userId){
  const account = await this.loadAccount({
    fields: {
      createdById: httpRequest?.userId,
      provider: "google",
    },
    options: {},
  });

  if (account) {
    // After creating the appointment, create a Google Calendar event
    const auth = await this.googleOAuthService.getGoogleOAuthToken(httpRequest?.userId);
    const calendar = google.calendar({ version: "v3", auth });
    
    // ... restante do código para criar o evento no Google Calendar
  }
}
*/