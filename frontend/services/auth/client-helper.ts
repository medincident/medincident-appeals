import { z } from "zod";
import { type ResultError, type Result } from "@/domain/error";
import { type AxiosError, type AxiosResponse } from "axios";

export async function handleApiRequest<T>(
  requestFn: () => Promise<AxiosResponse<any>>,
  schema?: z.ZodSchema<T>
): Promise<Result<T>> {
  try {
    const response = await requestFn();
    const data = response.data;

    if (schema) {
      const parsed = schema.safeParse(data);
      if (!parsed.success) {
        console.error("[api] Validation error:", parsed.error.format());
        return {
          success: false,
          error: {
            type: "VALIDATION_ERROR",
            message: "Invalid response format from server",
            details: parsed.error.format(),
          },
        };
      }
      return { success: true, data: parsed.data };
    }

    return { success: true, data: data as T };
  } catch (error: any) {
    if (error.isAxiosError) {
      const axiosError = error as AxiosError<any>;
      const status = axiosError.response?.status;
      const responseData = axiosError.response?.data;

      let errorType: ResultError["type"] = "API_ERROR";
      if (!axiosError.response) errorType = "NETWORK_ERROR";
      else if (status === 401 || status === 403) errorType = "AUTH_ERROR";

      return {
        success: false,
        error: {
          type: errorType,
          message: responseData?.message || axiosError.message,
          code: status || axiosError.code,
          details: responseData,
        },
      };
    }

    return {
      success: false,
      error: {
        type: "ERROR",
        message: error.message || "Unknown error",
      },
    };
  }
}
