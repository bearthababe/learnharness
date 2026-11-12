/** PR #62's single custom endpoint: discover/manual connect, offline pins,
 * and disconnect. Host boundaries and mutations live behind the server barrel. */
import { customProviderGet, customProviderMutation, scrubReports } from "@/src/server";

export const dynamic = "force-dynamic";
/** A saved custom key also leaves every saved 🐞 report (round 19 §0: never
 *  put keys in a report; merge proof N1). */
const thenScrubReports = async (request: Request) => {
	const response = await customProviderMutation(request);
	if (response.ok) { try { scrubReports(); } catch { /* reads clean them too */ } }
	return response;
};
export const GET = customProviderGet;
export const POST = thenScrubReports;
export const PATCH = thenScrubReports;
export const DELETE = customProviderMutation;
