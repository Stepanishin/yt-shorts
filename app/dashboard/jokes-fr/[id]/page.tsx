"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

interface JokeDataFR {
  _id?: string;
  source: string;
  title?: string;
  text: string;
  editedText?: string;
  category?: string;
  status?: "pending" | "reserved" | "used" | "rejected" | "deleted";
  createdAt?: string;
}

export default function JokeFRDetailPage() {
  const params = useParams();
  const [joke, setJoke] = useState<JokeDataFR | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editedText, setEditedText] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const id = params?.id as string;

  useEffect(() => {
    if (!id) return;

    const loadJoke = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/jokes-fr/${id}`);
        if (!response.ok) {
          throw new Error("[FR] Impossible de charger la blague");
        }
        const data = await response.json();
        setJoke(data.joke);
        setEditedText(data.joke.editedText || data.joke.text);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Une erreur s'est produite");
        console.error("[FR] Failed to load joke:", err);
      } finally {
        setLoading(false);
      }
    };

    loadJoke();
  }, [id]);

  const handleSaveText = async () => {
    if (!joke?._id) return;

    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/jokes-fr/${joke._id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          editedText: editedText,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "[FR] Impossible de sauvegarder le texte");
      }

      const result = await response.json();
      setJoke(result.joke);
      setIsEditing(false);
      console.log("[FR] Text saved successfully");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur de sauvegarde");
      console.error("[FR] Failed to save text:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!joke?._id) return;
    if (!confirm("Êtes-vous sûr de vouloir supprimer cette blague ?")) {
      return;
    }

    setDeleting(true);
    setError(null);
    try {
      const response = await fetch(`/api/jokes-fr/${joke._id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("[FR] Impossible de supprimer");
      }

      window.location.href = "/dashboard/jokes-fr";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur de suppression");
      console.error("[FR] Failed to delete:", err);
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-800">Chargement...</div>
      </div>
    );
  }

  if (error && !joke) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error}</p>
          <Link
            href="/dashboard/jokes-fr"
            className="text-blue-600 hover:underline"
          >
            Retour à la liste
          </Link>
        </div>
      </div>
    );
  }

  if (!joke) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-800 mb-4">Blague introuvable</p>
          <Link
            href="/dashboard/jokes-fr"
            className="text-blue-600 hover:underline"
          >
            Retour à la liste
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="px-8 py-6 max-w-4xl">
        <div className="mb-6">
          <Link
            href="/dashboard/jokes-fr"
            className="text-blue-600 hover:underline flex items-center gap-2"
          >
            <span>←</span>
            <span>Retour à la bibliothèque</span>
          </Link>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 mb-2">
                Blague Française
              </h1>
              <div className="text-sm text-gray-600">
                <p>Source: {joke.source}</p>
                {joke.category && <p>Catégorie: {joke.category}</p>}
                <p>Statut: {joke.status || "pending"}</p>
              </div>
            </div>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
            >
              {deleting ? "Suppression..." : "Supprimer"}
            </button>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded">
              {error}
            </div>
          )}

          <div className="mb-6">
            <h2 className="text-lg font-semibold mb-2 text-gray-900">Texte original:</h2>
            <div className="p-4 bg-gray-50 rounded border border-gray-200">
              <p className="text-gray-800 whitespace-pre-wrap">{joke.text}</p>
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <h2 className="text-lg font-semibold text-gray-900">Texte modifié:</h2>
              {!isEditing && (
                <button
                  onClick={() => setIsEditing(true)}
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  Modifier
                </button>
              )}
            </div>

            {isEditing ? (
              <div>
                <textarea
                  value={editedText}
                  onChange={(e) => setEditedText(e.target.value)}
                  className="w-full h-64 p-4 border border-gray-300 rounded text-gray-900 bg-white"
                  placeholder="Modifier le texte..."
                />
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={handleSaveText}
                    disabled={saving}
                    className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                  >
                    {saving ? "Enregistrement..." : "Enregistrer"}
                  </button>
                  <button
                    onClick={() => {
                      setIsEditing(false);
                      setEditedText(joke.editedText || joke.text);
                    }}
                    disabled={saving}
                    className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 disabled:opacity-50"
                  >
                    Annuler
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-4 bg-blue-50 rounded border border-blue-200">
                <p className="text-gray-800 whitespace-pre-wrap">
                  {joke.editedText || joke.text}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
