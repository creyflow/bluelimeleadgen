import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2, User, MapPin, Phone, Building, ArrowLeft, Camera } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { ProfileCharts } from "@/components/ProfileCharts";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface ProfileData {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  company: string | null;
  plan_id: string;
  last_name?: string | null; // Aggiunto campo cognome
}

const Profile = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<ProfileData | null>(null);

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate("/auth");
        return;
      }

      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (error) throw error;
      
      // Get avatar_url from user metadata
      const avatarUrl = user.user_metadata?.avatar_url;
      setProfile({ ...data, avatar_url: avatarUrl });
    } catch (error) {
      console.error("Error loading profile:", error);
      toast({
        title: "Errore",
        description: "Impossibile caricare il profilo",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!profile) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: profile.full_name,
          last_name: profile.last_name,
          phone: profile.phone,
          address: profile.address,
          city: profile.city,
          country: profile.country,
          company: profile.company,
          updated_at: new Date().toISOString(),
        })
        .eq("id", profile.id);

      if (error) throw error;

      toast({
        title: "Profilo aggiornato",
        description: "I tuoi dati sono stati salvati con successo",
      });
    } catch (error) {
      console.error("Error updating profile:", error);
      toast({
        title: "Errore",
        description: "Impossibile aggiornare il profilo",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${profile.id}.${fileExt}`;
      const filePath = `${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('avatar')
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage
        .from('avatar')
        .getPublicUrl(filePath);

      // Update user metadata with new avatar URL
      const { error: updateError } = await supabase.auth.updateUser({
        data: { avatar_url: data.publicUrl }
      });

      if (updateError) throw updateError;

      setProfile({ ...profile, avatar_url: data.publicUrl });

      toast({
        title: 'Successo',
        description: 'Foto profilo aggiornata!',
      });
    } catch (error: any) {
      console.error('Upload error:', error);
      toast({
        variant: 'destructive',
        title: 'Errore',
        description: error.message || 'Impossibile caricare la foto profilo',
      });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!profile) return null;

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <Button
            variant="ghost"
            onClick={() => navigate('/dashboard')}
            className="mb-4"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Torna alla Dashboard
          </Button>
          <h1 className="text-3xl font-bold">Il tuo Profilo</h1>
          <p className="text-muted-foreground">Gestisci le tue informazioni personali e monitora le tue attività.</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - User Card + Activity Chart */}
          <div className="space-y-6">
            {/* User Profile Card with Gradient */}
            <Card className="relative overflow-hidden">
              <div className="h-24 bg-gradient-to-r from-orange-400 via-pink-400 to-purple-500" />
              <CardContent className="relative pt-0 pb-6">
                <div className="flex flex-col items-center -mt-16">
                  <div className="relative">
                    <Avatar className="h-32 w-32 border-8 border-card shadow-xl ring-4 ring-primary/20 bg-card">
                      <AvatarImage src={profile.avatar_url} className="object-cover" />
                      <AvatarFallback className="text-4xl bg-blue-500 text-white">
                        {profile.full_name?.charAt(0).toUpperCase() || profile.email.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <label
                      htmlFor="avatar-upload"
                      className="absolute bottom-0 right-0 p-2 bg-primary text-primary-foreground rounded-full border-4 border-card cursor-pointer hover:bg-primary/90 shadow-lg"
                    >
                      <Camera className="h-5 w-5" />
                    </label>
                    <input
                      id="avatar-upload"
                      type="file"
                      accept="image/*"
                      onChange={handleAvatarUpload}
                      className="hidden"
                    />
                  </div>
                  <h2 className="mt-6 text-xl font-bold">{profile.full_name || 'Utente'}</h2>
                  <p className="text-sm text-muted-foreground">{profile.email}</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-4"
                    onClick={() => document.getElementById('avatar-upload')?.click()}
                  >
                    <Camera className="mr-2 h-4 w-4" />
                    Cambia Foto
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Activity Chart */}
            <Card>
              <CardHeader>
                <CardTitle>Attività Recente</CardTitle>
              </CardHeader>
              <CardContent>
                <ProfileCharts />
              </CardContent>
            </Card>
          </div>

          {/* Right Column - Personal Information Form */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <User className="h-5 w-5 text-primary" />
                  <CardTitle>Informazioni Personali</CardTitle>
                </div>
                <CardDescription>
                  Completa il tuo profilo per aiutarci a offrirti un servizio migliore.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={(e) => { e.preventDefault(); handleSave(); }} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="email">Email</Label>
                      <div className="relative">
                        <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                        <Input 
                          id="email" 
                          value={profile.email} 
                          disabled 
                          className="pl-9"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="fullName">Nome Completo</Label>
                      <div className="relative">
                        <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                        <Input 
                          id="fullName" 
                          placeholder="Mario Rossi" 
                          value={profile.full_name || ''}
                          onChange={(e) => setProfile({...profile, full_name: e.target.value})}
                          className="pl-9"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="phone">Telefono</Label>
                      <div className="relative">
                        <Phone className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                        <Input 
                          id="phone" 
                          placeholder="+39 333 1234567" 
                          value={profile.phone || ''}
                          onChange={(e) => setProfile({...profile, phone: e.target.value})}
                          className="pl-9"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="company">Azienda</Label>
                      <div className="relative">
                        <Building className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                        <Input 
                          id="company" 
                          placeholder="La Tua Azienda Srl" 
                          value={profile.company || ''}
                          onChange={(e) => setProfile({...profile, company: e.target.value})}
                          className="pl-9"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="address">Indirizzo</Label>
                    <div className="relative">
                      <MapPin className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input 
                        id="address" 
                        placeholder="Via Roma 1" 
                        value={profile.address || ''}
                        onChange={(e) => setProfile({...profile, address: e.target.value})}
                        className="pl-9"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="city">Città</Label>
                      <Input 
                        id="city" 
                        placeholder="Milano" 
                        value={profile.city || ''}
                        onChange={(e) => setProfile({...profile, city: e.target.value})}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="country">Paese</Label>
                      <Input 
                        id="country" 
                        placeholder="Italia" 
                        value={profile.country || ''}
                        onChange={(e) => setProfile({...profile, country: e.target.value})}
                      />
                    </div>
                  </div>

                  <div className="pt-4">
                    <Button type="submit" disabled={saving} size="lg" className="w-full md:w-auto">
                      {saving ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Salvataggio...
                        </>
                      ) : (
                        'Salva Modifiche'
                      )}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Profile;
