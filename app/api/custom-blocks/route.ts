import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  getCustomBlocksByUserId,
  createCustomBlock,
  deleteCustomBlock,
  updateCustomBlock,
} from "@/lib/db/custom-blocks";

// GET - получить все кастомные блоки пользователя
export async function GET(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const blocks = await getCustomBlocksByUserId(session.user.id);
    return NextResponse.json({ blocks });
  } catch (error) {
    console.error("Error fetching custom blocks:", error);
    return NextResponse.json(
      { error: "Failed to fetch custom blocks" },
      { status: 500 }
    );
  }
}

// POST - создать новый кастомный блок
export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const {
      name,
      text,
      x,
      y,
      fontSize,
      color,
      backgroundColor,
      boxPadding,
      fontWeight,
      width,
    } = body;

    // Валидация обязательных полей
    if (
      text === undefined ||
      x === undefined ||
      y === undefined ||
      fontSize === undefined ||
      color === undefined
    ) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const block = await createCustomBlock(session.user.id, {
      name,
      text,
      x,
      y,
      fontSize,
      color,
      backgroundColor,
      boxPadding,
      fontWeight,
      width,
    });

    return NextResponse.json({ block });
  } catch (error) {
    console.error("Error creating custom block:", error);
    return NextResponse.json(
      { error: "Failed to create custom block" },
      { status: 500 }
    );
  }
}

// DELETE - удалить кастомный блок
export async function DELETE(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const blockId = searchParams.get("id");

    if (!blockId) {
      return NextResponse.json(
        { error: "Block ID is required" },
        { status: 400 }
      );
    }

    const success = await deleteCustomBlock(blockId, session.user.id);

    if (!success) {
      return NextResponse.json(
        { error: "Block not found or unauthorized" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting custom block:", error);
    return NextResponse.json(
      { error: "Failed to delete custom block" },
      { status: 500 }
    );
  }
}

// PUT - обновить кастомный блок
export async function PUT(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json(
        { error: "Block ID is required" },
        { status: 400 }
      );
    }

    const block = await updateCustomBlock(id, session.user.id, updates);

    if (!block) {
      return NextResponse.json(
        { error: "Block not found or unauthorized" },
        { status: 404 }
      );
    }

    return NextResponse.json({ block });
  } catch (error) {
    console.error("Error updating custom block:", error);
    return NextResponse.json(
      { error: "Failed to update custom block" },
      { status: 500 }
    );
  }
}
