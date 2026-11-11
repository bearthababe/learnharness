export function previewCookieBootstrap(prefix: string | undefined): string | undefined {
	if (!prefix) return undefined;
	if (!/^lh-preview-[a-z0-9-]+__$/.test(prefix)) throw new Error("Invalid preview cookie prefix");
	return `(()=>{const prefix=${JSON.stringify(prefix)};const descriptor=Object.getOwnPropertyDescriptor(Document.prototype,"cookie");if(!descriptor?.get||!descriptor.set)throw new Error("Preview cookie isolation unavailable");Object.defineProperty(document,"cookie",{configurable:false,get(){return descriptor.get.call(document).split(";").map(value=>value.trim()).filter(value=>value.startsWith(prefix)).map(value=>value.slice(prefix.length)).join("; ")},set(value){descriptor.set.call(document,prefix+value)}});})()`;
}
